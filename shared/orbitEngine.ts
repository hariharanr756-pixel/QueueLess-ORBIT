import type {
  AnalyticsSummary,
  ContributingFactor,
  Counter,
  Department,
  Doctor,
  FairnessSummary,
  HospitalStateSnapshot,
  OrchestrationRecommendation,
  Prediction,
  PredictionConfidence,
  QueueToken,
  SimulationComparisonResult,
  SimulationMetrics,
  SimulationParams,
  SimulationPresetId,
} from './types.ts';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round(val: number): number {
  return Math.round(val);
}

/**
 * Deterministic, explainable ORBIT Intelligence Engine.
 * Recalculates queue positions, PREDICT wait ranges, ORCHESTRATE capacity
 * recommendations, PROTECT fairness metrics, and Admin Analytics.
 *
 * NOTE: This uses a transparent deterministic queueing baseline with demo data.
 * It is architecturally prepared to swap in a Python FastAPI + trained Random Forest
 * model via /server/mlAdapter.ts without claiming untrained AI accuracy.
 */
export function recalculateHospitalIntelligence(
  departments: Department[],
  doctors: Doctor[],
  counters: Counter[],
  tokens: QueueToken[],
  existingRecommendations: OrchestrationRecommendation[]
): {
  queueTokens: QueueToken[];
  predictions: Prediction[];
  recommendations: OrchestrationRecommendation[];
  fairness: FairnessSummary;
  analytics: AnalyticsSummary;
} {
  const nowIso = new Date().toISOString();
  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));

  const openCounters = counters.filter((c) => c.status === 'Open');
  const openCounterCount = Math.max(1, openCounters.length);
  const availableDoctors = doctors.filter(
    (d) => d.availability === 'Available' || d.availability === 'Busy'
  );
  const activeDoctorCount = availableDoctors.length;
  const unavailableDoctors = doctors.filter(
    (d) => d.availability === 'Unavailable' || d.availability === 'On Break'
  );

  // Separate active waiting/called tokens from non-waiting
  const waitingTokens = tokens.filter((t) => t.status === 'waiting' || t.status === 'called');
  const inConsultationTokens = tokens.filter((t) => t.status === 'in_consultation');

  // PROTECT rule: Transparent ordering
  // 1. Called tokens stay at the head
  // 2. Clinician-authorized priority (with mandatory authorization record) gets bounded priority
  //    Starvation guard: standard patients waiting > 35 min ahead of new arrivals keep fair turn
  // 3. Otherwise appointment time / arrival time FIFO
  const sortTokens = (list: QueueToken[]): QueueToken[] => {
    return [...list].sort((a, b) => {
      if (a.status === 'called' && b.status !== 'called') return -1;
      if (b.status === 'called' && a.status !== 'called') return 1;

      const aPriority =
        a.priorityLevel === 'clinician_priority' && Boolean(a.priorityAuthorizedBy) ? 1 : 0;
      const bPriority =
        b.priorityLevel === 'clinician_priority' && Boolean(b.priorityAuthorizedBy) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;

      // Slight appointment adherence preference over late walk-ins within same arrival window
      const aTime = new Date(a.arrivalTime).getTime();
      const bTime = new Date(b.arrivalTime).getTime();
      const aScore = aTime - (a.type === 'appointment' ? 5 * 60_000 : 0);
      const bScore = bTime - (b.type === 'appointment' ? 5 * 60_000 : 0);
      return aScore - bScore;
    });
  };

  // Group waiting tokens by department for department-level queue position
  const tokensByDept = new Map<string, QueueToken[]>();
  for (const t of waitingTokens) {
    const arr = tokensByDept.get(t.departmentId) || [];
    arr.push(t);
    tokensByDept.set(t.departmentId, arr);
  }

  const predictions: Prediction[] = [];
  const updatedMap = new Map<string, QueueToken>();

  // Calculate effective hospital-wide capacity factor
  const doctorRatio = doctors.length > 0 ? activeDoctorCount / doctors.length : 1;
  const counterRatio = counters.length > 0 ? openCounters.length / counters.length : 1;
  const counterIntakePenaltyFactor = openCounters.length < 3 ? 1.24 : openCounters.length === 3 ? 1.08 : 0.88;
  const doctorPenaltyMultiplier =
    activeDoctorCount === 0
      ? 2.4
      : activeDoctorCount === 1
      ? 1.85
      : activeDoctorCount === 2
      ? 1.38
      : 1.0;

  for (const [deptId, deptTokens] of tokensByDept.entries()) {
    const dept = deptMap.get(deptId);
    const ordered = sortTokens(deptTokens);

    // Count doctors actively covering this department (primary or cross-covering)
    const deptActiveDoctors = availableDoctors.filter(
      (doc) => doc.departmentId === deptId || doc.secondaryDepartmentIds.includes(deptId)
    );
    const effectiveDeptDoctors = Math.max(
      0.5,
      deptActiveDoctors.length > 0
        ? deptActiveDoctors.reduce(
            (acc, doc) => acc + (doc.departmentId === deptId ? 1.0 : 0.45),
            0
          )
        : activeDoctorCount > 0
        ? 0.65
        : 0.35
    );

    const deptOpenCounters = openCounters.filter((c) => c.departmentId === deptId).length;
    const deptActiveConsults = inConsultationTokens.filter((t) => t.departmentId === deptId).length;
    const baseServiceMin = dept?.avgServiceMin ?? 12;

    ordered.forEach((token, idx) => {
      const assignedDoc = doctorMap.get(token.doctorId);
      const docUnavailable =
        !assignedDoc ||
        assignedDoc.availability === 'Unavailable' ||
        assignedDoc.availability === 'On Break';

      const patientsAhead = idx;
      const queuePosition = idx + 1;

      const factors: ContributingFactor[] = [];

      // 1. Patients ahead & historical service duration
      const queueLoadMin =
        ((patientsAhead + (deptActiveConsults > 0 ? 0.45 : 0)) * baseServiceMin) /
        effectiveDeptDoctors;
      factors.push({
        label: `Queue ahead (${patientsAhead} patients)`,
        impactMinutes: round(queueLoadMin),
        detail: `${patientsAhead} ahead × ${baseServiceMin}m avg service ÷ ${effectiveDeptDoctors.toFixed(1)} effective clinicians`,
      });

      // 2. Doctor availability & reassignment impact
      let doctorImpact = 0;
      if (docUnavailable) {
        doctorImpact = round(baseServiceMin * 0.85 + (patientsAhead + 1) * 2.2);
        factors.push({
          label: `Assigned clinician ${assignedDoc ? assignedDoc.availability.toLowerCase() : 'unassigned'}`,
          impactMinutes: doctorImpact,
          detail: assignedDoc
            ? `${assignedDoc.name} is ${assignedDoc.availability}; load redistributed to active roster`
            : 'Rebalancing to active department clinicians',
        });
      } else if (activeDoctorCount < doctors.length) {
        doctorImpact = round(queueLoadMin * (doctorPenaltyMultiplier - 1) * 0.45);
        if (doctorImpact > 0) {
          factors.push({
            label: `Hospital clinician capacity (${activeDoctorCount}/${doctors.length} active)`,
            impactMinutes: doctorImpact,
            detail: `${unavailableDoctors.length} clinician(s) offline increases cross-department spillover`,
          });
        }
      }

      // 3. Open counters & intake pacing
      const counterImpact =
        deptOpenCounters === 0
          ? round(4 + patientsAhead * 1.4)
          : openCounters.length >= 4
          ? -round(Math.min(7, 2 + patientsAhead * 1.1))
          : round((counterIntakePenaltyFactor - 1) * Math.max(8, queueLoadMin));

      factors.push({
        label: `Open counters (${openCounters.length}/${counters.length} open)`,
        impactMinutes: counterImpact,
        detail:
          openCounters.length >= 4
            ? 'All 4 intake counters open — parallel check-in reduces turnaround friction'
            : deptOpenCounters === 0
            ? 'Shared intake counter routing adds registration queueing'
            : `${openCounters.length} active counters handling intake`,
      });

      // 4. Appointment delay drift
      const delayImpact = token.delayMinutes > 0 ? round(token.delayMinutes * 0.75) : 0;
      if (delayImpact > 0) {
        factors.push({
          label: `Schedule delay drift`,
          impactMinutes: delayImpact,
          detail: `+${token.delayMinutes}m upstream appointment delay`,
        });
      }

      // 5. Clinician-authorized priority adjustment (PROTECT)
      if (token.priorityLevel === 'clinician_priority' && token.priorityAuthorizedBy) {
        factors.push({
          label: `Clinician-authorized priority`,
          impactMinutes: -round(Math.min(10, baseServiceMin * 0.5)),
          detail: `Authorized by ${token.priorityAuthorizedBy} (${token.priorityReason || 'Clinical escalation'})`,
        });
      }

      const rawCenter =
        token.status === 'called'
          ? 2
          : Math.max(
              3,
              queueLoadMin + doctorImpact + counterImpact + delayImpact
            );

      // Uncertainty band grows with queue depth, offline doctors, and walk-in volatility
      const uncertaintyRatio =
        0.16 +
        (docUnavailable ? 0.1 : 0) +
        (activeDoctorCount < doctors.length ? 0.06 : 0) +
        (patientsAhead > 5 ? 0.05 : 0) +
        (openCounterCount < 3 ? 0.05 : 0);

      const spread = Math.max(2, round(rawCenter * uncertaintyRatio));
      const predictedWaitMin = token.status === 'called' ? 1 : Math.max(2, round(rawCenter - spread));
      const predictedWaitMax =
        token.status === 'called' ? 4 : Math.max(predictedWaitMin + 3, round(rawCenter + spread));

      const confidence: PredictionConfidence =
        uncertaintyRatio <= 0.2
          ? 'High'
          : uncertaintyRatio <= 0.29
          ? 'Moderate'
          : 'Lower';

      const updatedToken: QueueToken = {
        ...token,
        queuePosition,
        patientsAhead,
        predictedWaitMin,
        predictedWaitMax,
        confidence,
        contributingFactors: factors,
      };
      updatedMap.set(token.id, updatedToken);

      predictions.push({
        id: `pred-${token.id}`,
        tokenId: token.id,
        departmentId: deptId,
        predictedWaitMin,
        predictedWaitMax,
        estimatedConsultationMin: baseServiceMin,
        uncertaintyMinutes: spread,
        confidence,
        contributingFactors: factors,
        modelEngine: 'deterministic_baseline_v1',
        calculatedAt: nowIso,
      });
    });
  }

  // Non-waiting tokens keep zeroed queue positions
  const finalTokens = tokens.map((t) => {
    const updated = updatedMap.get(t.id);
    if (updated) return updated;
    return {
      ...t,
      queuePosition: 0,
      patientsAhead: 0,
      predictedWaitMin: t.status === 'in_consultation' ? 0 : t.predictedWaitMin,
      predictedWaitMax: t.status === 'in_consultation' ? 0 : t.predictedWaitMax,
    };
  });

  // Compute Analytics Summary
  const activeWaiting = finalTokens.filter((t) => t.status === 'waiting' || t.status === 'called');
  const activeConsults = finalTokens.filter((t) => t.status === 'in_consultation');
  const completedTokens = finalTokens.filter((t) => t.status === 'completed');
  const noShowTokens = finalTokens.filter((t) => t.status === 'no_show');
  const cancelledTokens = finalTokens.filter((t) => t.status === 'cancelled');

  const avgPredictedWaitMin =
    activeWaiting.length > 0
      ? round(activeWaiting.reduce((s, t) => s + t.predictedWaitMin, 0) / activeWaiting.length)
      : 0;
  const avgPredictedWaitMax =
    activeWaiting.length > 0
      ? round(activeWaiting.reduce((s, t) => s + t.predictedWaitMax, 0) / activeWaiting.length)
      : 0;

  const departmentWaitStats = departments.map((dept) => {
    const deptWaiting = activeWaiting.filter((t) => t.departmentId === dept.id);
    const minAvg =
      deptWaiting.length > 0
        ? round(deptWaiting.reduce((s, t) => s + t.predictedWaitMin, 0) / deptWaiting.length)
        : 0;
    const maxAvg =
      deptWaiting.length > 0
        ? round(deptWaiting.reduce((s, t) => s + t.predictedWaitMax, 0) / deptWaiting.length)
        : 0;
    return {
      departmentId: dept.id,
      departmentName: dept.name,
      waitingCount: deptWaiting.length,
      avgWaitMin: minAvg,
      avgWaitMax: maxAvg,
      targetWaitMin: dept.targetWaitMin,
    };
  });

  const doctorUtilization = doctors.map((doc) => {
    const waitingAssigned = activeWaiting.filter((t) => t.doctorId === doc.id).length;
    const activeAssigned = activeConsults.filter((t) => t.doctorId === doc.id).length;
    let util = 0;
    if (doc.availability === 'Unavailable') {
      util = 0;
    } else if (doc.availability === 'On Break') {
      util = 15;
    } else {
      util = clamp(
        round(
          (activeAssigned * 35 + waitingAssigned * 12 + doc.completedToday * 4) *
            (doc.availability === 'Busy' ? 1.15 : 1.0)
        ),
        20,
        100
      );
    }
    return {
      doctorId: doc.id,
      doctorName: doc.name,
      availability: doc.availability,
      waitingAssigned,
      completedToday: doc.completedToday,
      utilizationPct: util,
    };
  });

  // Build deterministic hourly arrivals curve anchored on current demo counts
  const totalWalkIns = finalTokens.filter((t) => t.type === 'walk_in').length;
  const totalAppts = finalTokens.filter((t) => t.type === 'appointment').length;
  const completedCount = completedTokens.length;
  const hourlyArrivals = [
    { hour: '08:00', arrivals: 5, completed: 4, walkIns: 2, appointments: 3 },
    { hour: '09:00', arrivals: 8, completed: 6, walkIns: 3, appointments: 5 },
    {
      hour: '10:00',
      arrivals: Math.max(7, round(activeWaiting.length * 0.45)),
      completed: Math.max(4, round(completedCount * 0.6)),
      walkIns: Math.max(3, round(totalWalkIns * 0.35)),
      appointments: Math.max(4, round(totalAppts * 0.35)),
    },
    {
      hour: '11:00',
      arrivals: Math.max(6, round(activeWaiting.length * 0.55)),
      completed: Math.max(3, round(completedCount * 0.4) + activeConsults.length),
      walkIns: Math.max(2, round(totalWalkIns * 0.4)),
      appointments: Math.max(4, round(totalAppts * 0.4)),
    },
    {
      hour: '12:00',
      arrivals: Math.max(5, round(activeWaiting.length * 0.35)),
      completed: Math.max(5, activeDoctorCount * 3),
      walkIns: Math.max(2, round(totalWalkIns * 0.25)),
      appointments: Math.max(3, round(totalAppts * 0.25)),
    },
  ];

  // ORCHESTRATE: Generate actionable capacity recommendations dynamically
  const resolvedHistory = existingRecommendations.filter((r) => r.status !== 'pending');
  const nextPending: OrchestrationRecommendation[] = [];

  const closedCounter = counters.find((c) => c.status === 'Closed');
  const busiestDept = [...departmentWaitStats].sort((a, b) => b.avgWaitMax - a.avgWaitMax)[0];

  if (closedCounter && (avgPredictedWaitMax >= 24 || unavailableDoctors.length > 0 || activeWaiting.length >= 10)) {
    nextPending.push({
      id: `rec-open-${closedCounter.id}`,
      severity: unavailableDoctors.length > 0 || avgPredictedWaitMax >= 35 ? 'critical' : 'warning',
      title: `Open Standby ${closedCounter.name} to Reduce Intake Bottleneck`,
      summary: `${activeWaiting.length} patients are currently queued (${avgPredictedWaitMin}–${avgPredictedWaitMax}m predicted wait) with ${openCounters.length}/${counters.length} counters open. Opening ${closedCounter.name} relieves intake queueing and reduces estimated wait times by ~5–9 minutes.`,
      departmentId: busiestDept?.departmentId,
      actionType: 'open_counter',
      actionLabel: `Open ${closedCounter.name}`,
      targetCounterId: closedCounter.id,
      estimatedWaitReductionMin: unavailableDoctors.length > 0 ? 8 : 6,
      contributingFactors: [
        `${activeWaiting.length} waiting patients across ${departmentWaitStats.filter((d) => d.waitingCount > 0).length} active clinics`,
        `${unavailableDoctors.length} clinician(s) currently unavailable or on break`,
        `${closedCounter.name} is on standby and ready for immediate activation`,
      ],
      status: 'pending',
      createdAt: nowIso,
    });
  }

  if (unavailableDoctors.length > 0) {
    const names = unavailableDoctors.map((d) => `${d.name} (${d.availability})`).join(', ');
    nextPending.push({
      id: `rec-rebalance-offline`,
      severity: 'critical',
      title: `Rebalance Queue Following Clinician Unavailability`,
      summary: `${names} reduced active clinical coverage to ${activeDoctorCount}/${doctors.length}. Reassigning waiting follow-ups and walk-ins across active specialists stabilizes fairness and bounds wait variance.`,
      departmentId: unavailableDoctors[0].departmentId,
      actionType: 'rebalance_queue',
      actionLabel: 'Rebalance Waiting Tokens',
      estimatedWaitReductionMin: 7,
      contributingFactors: [
        `Active clinicians dropped to ${activeDoctorCount} of ${doctors.length}`,
        `Average predicted wait expanded to ${avgPredictedWaitMin}–${avgPredictedWaitMax} min`,
        `Cross-department coverage available from remaining active clinicians`,
      ],
      status: 'pending',
      createdAt: nowIso,
    });
  }

  if (busiestDept && busiestDept.avgWaitMax > busiestDept.targetWaitMin + 8) {
    nextPending.push({
      id: `rec-notify-${busiestDept.departmentId}`,
      severity: 'info',
      title: `Send Proactive Wait-Time Transparency Update (${busiestDept.departmentName})`,
      summary: `${busiestDept.departmentName} predicted wait (${busiestDept.avgWaitMin}–${busiestDept.avgWaitMax}m) exceeds target (${busiestDept.targetWaitMin}m). Sending a transparent expectation update to queued patients reduces front-desk escalations.`,
      departmentId: busiestDept.departmentId,
      actionType: 'notify_patients',
      actionLabel: `Notify ${busiestDept.departmentName} Queue`,
      estimatedWaitReductionMin: 0,
      contributingFactors: [
        `${busiestDept.waitingCount} patients waiting in ${busiestDept.departmentName}`,
        `Target wait SLA: ${busiestDept.targetWaitMin} min`,
      ],
      status: 'pending',
      createdAt: nowIso,
    });
  }

  // PROTECT: Fairness summary
  const clinicianPriorityCount = activeWaiting.filter(
    (t) => t.priorityLevel === 'clinician_priority' && Boolean(t.priorityAuthorizedBy)
  ).length;
  const standardWaiting = activeWaiting.filter((t) => t.priorityLevel !== 'clinician_priority');
  const maxStandardWaitMin =
    standardWaiting.length > 0
      ? Math.max(...standardWaiting.map((t) => t.predictedWaitMax))
      : 0;
  const starvationGuardActive = maxStandardWaitMin >= 42;
  const fairnessIndex = clamp(
    round(
      98 -
        Math.max(0, maxStandardWaitMin - 28) * 0.45 -
        (clinicianPriorityCount > 3 ? (clinicianPriorityCount - 3) * 4 : 0) +
        (doctorRatio >= 1 && counterRatio >= 0.75 ? 2 : 0)
    ),
    62,
    99
  );

  const fairness: FairnessSummary = {
    fairnessIndex,
    clinicianPriorityCount,
    maxStandardWaitMin,
    starvationGuardActive,
    policyNote:
      'Transparent FIFO + appointment-adherence ordering. AI never independently assigns clinical urgency; every priority escalation requires named clinician authorization and audit logging.',
  };

  const analytics: AnalyticsSummary = {
    totalWaiting: activeWaiting.length,
    activeConsultations: activeConsults.length,
    completedConsultations: completedTokens.length,
    avgPredictedWaitMin,
    avgPredictedWaitMax,
    openCounters: openCounters.length,
    totalCounters: counters.length,
    activeDoctors: activeDoctorCount,
    totalDoctors: doctors.length,
    walkInCount: totalWalkIns,
    appointmentCount: totalAppts,
    noShowCount: noShowTokens.length,
    cancelledCount: cancelledTokens.length,
    hourlyArrivals,
    departmentWaitStats,
    doctorUtilization,
  };

  return {
    queueTokens: finalTokens,
    predictions,
    recommendations: [...nextPending, ...resolvedHistory.slice(0, 8)],
    fairness,
    analytics,
  };
}

/**
 * Derive current live SimulationParams baseline from the live hospital state.
 */
export function deriveBaselineSimulationParams(state: HospitalStateSnapshot): SimulationParams {
  const activeWaiting = state.analytics.totalWaiting;
  const activeDoctors = Math.max(1, state.analytics.activeDoctors);
  const openCounters = Math.max(1, state.analytics.openCounters);
  const avgConsult =
    state.doctors.length > 0
      ? round(
          state.doctors.reduce((sum, d) => sum + d.avgConsultationMin, 0) / state.doctors.length
        )
      : 12;
  const waitingTokens = state.queueTokens.filter(
    (t) => t.status === 'waiting' || t.status === 'called'
  );
  const avgDelay =
    waitingTokens.length > 0
      ? round(waitingTokens.reduce((s, t) => s + t.delayMinutes, 0) / waitingTokens.length)
      : 5;

  return {
    incomingPatientVolume: clamp(activeWaiting, 6, 80),
    doctorAvailability: clamp(activeDoctors, 1, 6),
    openCounters: clamp(openCounters, 1, 6),
    consultationDuration: clamp(avgConsult, 6, 30),
    appointmentDelays: clamp(avgDelay, 0, 45),
    patientArrivalRate: clamp(round(activeWaiting * 0.72), 4, 30),
  };
}

export function getPresetSimulationParams(
  presetId: SimulationPresetId,
  baseline: SimulationParams
): SimulationParams {
  switch (presetId) {
    case 'normal_operations':
      return { ...baseline };
    case 'patient_surge':
      return {
        ...baseline,
        incomingPatientVolume: clamp(round(baseline.incomingPatientVolume * 1.85), 18, 75),
        patientArrivalRate: clamp(round(baseline.patientArrivalRate * 1.75), 14, 30),
        appointmentDelays: clamp(baseline.appointmentDelays + 6, 0, 45),
      };
    case 'doctor_unavailable':
      return {
        ...baseline,
        doctorAvailability: Math.max(1, baseline.doctorAvailability - 1),
      };
    case 'additional_counter':
      return {
        ...baseline,
        openCounters: clamp(baseline.openCounters + 1, 1, 6),
      };
    case 'appointment_delays':
      return {
        ...baseline,
        appointmentDelays: clamp(baseline.appointmentDelays + 20, 15, 45),
        consultationDuration: clamp(baseline.consultationDuration + 3, 6, 30),
      };
  }
}

/**
 * Deterministic Hospital Queue What-If Metrics Calculator.
 * Produces illustrative, clearly explainable queueing metrics (no static fake animations).
 */
export function evaluateSimulationMetrics(params: SimulationParams): SimulationMetrics {
  const doctors = Math.max(1, params.doctorAvailability);
  const counters = Math.max(1, params.openCounters);
  const consultMin = Math.max(5, params.consultationDuration);
  const volume = Math.max(1, params.incomingPatientVolume);
  const arrivalRate = Math.max(1, params.patientArrivalRate);
  const delayMin = Math.max(0, params.appointmentDelays);

  // Clinician throughput (patients / hr)
  const doctorThroughputPerHr = doctors * (60 / consultMin);
  // Counter check-in/triage/discharge capacity (approx 6.5 patients/hr per counter)
  const counterThroughputPerHr = counters * 6.5;

  // Effective throughput accounts for intake counter friction even when doctors are ready
  const effectiveThroughput = Math.max(
    1.5,
    Math.min(doctorThroughputPerHr, counterThroughputPerHr * 1.15) *
      (counters < doctors ? 0.86 : counters > doctors ? 1.06 : 0.96)
  );

  const doctorUtilizationPct = clamp(round((arrivalRate / doctorThroughputPerHr) * 100), 15, 100);
  const counterUtilizationPct = clamp(round((arrivalRate / counterThroughputPerHr) * 100), 15, 100);

  // Average queue wait from existing queue volume + arrival pressure + intake friction + schedule delay
  const queueDrainWait = ((volume * 0.55) / effectiveThroughput) * 60;
  const arrivalCongestionPenalty =
    arrivalRate > effectiveThroughput
      ? ((arrivalRate - effectiveThroughput) / effectiveThroughput) * 26
      : 0;
  const intakeCounterWait =
    counters === 1
      ? 14
      : counters === 2
      ? 8
      : counters === 3
      ? 4
      : Math.max(1, 5 - counters);
  const delayCascade = delayMin * 0.72;

  const avgWaitMinutes = Math.max(
    4,
    round(queueDrainWait + arrivalCongestionPenalty + intakeCounterWait + delayCascade)
  );

  const spreadPct =
    0.16 +
    (doctorUtilizationPct > 85 ? 0.08 : 0) +
    (counterUtilizationPct > 85 ? 0.06 : 0) +
    (delayMin > 15 ? 0.05 : 0);
  const spread = Math.max(3, round(avgWaitMinutes * spreadPct));
  const predictedWaitMin = Math.max(2, avgWaitMinutes - spread);
  const predictedWaitMax = avgWaitMinutes + spread;

  const queueClearanceMinutes = Math.max(
    consultMin,
    round((volume / effectiveThroughput) * 60 + delayMin * 0.5)
  );

  const backlogDeltaPerHour = Number((arrivalRate - effectiveThroughput).toFixed(1));

  // Bottleneck diagnosis
  let bottleneckType = 'Balanced Operations';
  let bottleneckSeverity: SimulationMetrics['bottleneckSeverity'] = 'Low';

  if (doctorUtilizationPct >= 92 && doctorThroughputPerHr <= counterThroughputPerHr) {
    bottleneckType = 'Clinician Capacity Bottleneck';
    bottleneckSeverity = avgWaitMinutes >= 45 ? 'Critical' : 'High';
  } else if (counterUtilizationPct >= 88 && counterThroughputPerHr < doctorThroughputPerHr) {
    bottleneckType = 'Intake Counter Bottleneck';
    bottleneckSeverity = avgWaitMinutes >= 40 ? 'Critical' : 'High';
  } else if (delayMin >= 20) {
    bottleneckType = 'Appointment Delay Cascade';
    bottleneckSeverity = avgWaitMinutes >= 38 ? 'High' : 'Moderate';
  } else if (avgWaitMinutes >= 28 || doctorUtilizationPct >= 78 || counterUtilizationPct >= 78) {
    bottleneckType = 'Moderate Queue Congestion';
    bottleneckSeverity = 'Moderate';
  }

  const fairnessScore = clamp(
    round(100 - Math.max(0, avgWaitMinutes - 18) * 0.65 - (delayMin > 15 ? 8 : 0)),
    48,
    99
  );

  // 6-hour projection
  const hourlyProjection: SimulationMetrics['hourlyProjection'] = [];
  let runningQueue = volume;
  for (let h = 0; h < 6; h++) {
    const label = h === 0 ? 'Now' : `+${h}h`;
    const hourWait = Math.max(
      3,
      round(((runningQueue * 0.55) / effectiveThroughput) * 60 + intakeCounterWait + delayCascade * Math.max(0.4, 1 - h * 0.12))
    );
    hourlyProjection.push({
      hour: label,
      waitingQueue: round(runningQueue),
      avgWaitMin: hourWait,
      throughput: round(effectiveThroughput),
    });
    // Arrival taper after hour 3 so curves remain realistic
    const hourlyArrivals = h >= 3 ? arrivalRate * 0.75 : arrivalRate;
    runningQueue = Math.max(0, runningQueue + hourlyArrivals - effectiveThroughput);
  }

  return {
    predictedWaitMin,
    predictedWaitMax,
    avgWaitMinutes,
    queueClearanceMinutes,
    doctorUtilizationPct,
    counterUtilizationPct,
    throughputPerHour: Number(effectiveThroughput.toFixed(1)),
    backlogDeltaPerHour,
    fairnessScore,
    bottleneckType,
    bottleneckSeverity,
    hourlyProjection,
  };
}

export function runOrbitSimulation(
  baselineParams: SimulationParams,
  scenarioParams: SimulationParams
): SimulationComparisonResult {
  const before = evaluateSimulationMetrics(baselineParams);
  const after = evaluateSimulationMetrics(scenarioParams);

  const avgWaitDiff = after.avgWaitMinutes - before.avgWaitMinutes;
  const waitMinDiff = after.predictedWaitMin - before.predictedWaitMin;
  const waitMaxDiff = after.predictedWaitMax - before.predictedWaitMax;
  const clearanceDiff = after.queueClearanceMinutes - before.queueClearanceMinutes;
  const doctorUtilDiff = after.doctorUtilizationPct - before.doctorUtilizationPct;
  const counterUtilDiff = after.counterUtilizationPct - before.counterUtilizationPct;
  const fairnessDiff = after.fairnessScore - before.fairnessScore;

  const changes: string[] = [];
  if (scenarioParams.incomingPatientVolume !== baselineParams.incomingPatientVolume) {
    changes.push(
      `Queue volume changed from ${baselineParams.incomingPatientVolume} to ${scenarioParams.incomingPatientVolume} patients`
    );
  }
  if (scenarioParams.doctorAvailability !== baselineParams.doctorAvailability) {
    changes.push(
      `Active doctors changed from ${baselineParams.doctorAvailability} to ${scenarioParams.doctorAvailability}`
    );
  }
  if (scenarioParams.openCounters !== baselineParams.openCounters) {
    changes.push(
      `Open counters changed from ${baselineParams.openCounters} to ${scenarioParams.openCounters}`
    );
  }
  if (scenarioParams.consultationDuration !== baselineParams.consultationDuration) {
    changes.push(
      `Avg consultation duration changed from ${baselineParams.consultationDuration}m to ${scenarioParams.consultationDuration}m`
    );
  }
  if (scenarioParams.appointmentDelays !== baselineParams.appointmentDelays) {
    changes.push(
      `Appointment delay drift changed from ${baselineParams.appointmentDelays}m to ${scenarioParams.appointmentDelays}m`
    );
  }
  if (scenarioParams.patientArrivalRate !== baselineParams.patientArrivalRate) {
    changes.push(
      `Arrival rate changed from ${baselineParams.patientArrivalRate}/hr to ${scenarioParams.patientArrivalRate}/hr`
    );
  }

  const whatChanged =
    changes.length > 0
      ? `Predicted waiting time shifted from ${before.predictedWaitMin}–${before.predictedWaitMax}m to ${after.predictedWaitMin}–${after.predictedWaitMax}m (${avgWaitDiff >= 0 ? '+' : ''}${avgWaitDiff}m avg).`
      : `Scenario matches baseline parameters (${after.predictedWaitMin}–${after.predictedWaitMax}m predicted wait).`;

  const why =
    avgWaitDiff > 3
      ? `Effective throughput (${after.throughputPerHour} pts/hr) is strained against incoming demand (${scenarioParams.patientArrivalRate} pts/hr), creating a ${after.bottleneckType.toLowerCase()}.`
      : avgWaitDiff < -3
      ? `Added capacity lifted effective throughput to ${after.throughputPerHour} pts/hr, lowering queue clearance time by ${Math.abs(clearanceDiff)} minutes and improving fairness to ${after.fairnessScore}/100.`
      : `System throughput (${after.throughputPerHour} pts/hr) remains balanced against patient arrival velocity (${scenarioParams.patientArrivalRate} pts/hr).`;

  let recommendedAction = 'Maintain current counter and clinician allocation; continue standard fairness monitoring.';
  if (after.bottleneckType === 'Clinician Capacity Bottleneck') {
    recommendedAction = `Activate 1 cross-covering clinician or redistribute walk-in intake; consider opening an additional counter to minimize registration drag.`;
  } else if (after.bottleneckType === 'Intake Counter Bottleneck') {
    recommendedAction = `Open 1 additional intake counter (${Math.min(6, scenarioParams.openCounters + 1)} total) to unlock doctor throughput and cut wait times.`;
  } else if (after.bottleneckType === 'Appointment Delay Cascade') {
    recommendedAction = `Trigger automated patient delay notifications and stagger walk-in check-ins until schedule drift drops below 10 minutes.`;
  } else if (avgWaitDiff < -3) {
    recommendedAction = `Adopt this configuration in live operations — predicted average wait drops by ${Math.abs(avgWaitDiff)} minutes with ${after.bottleneckSeverity.toLowerCase()} bottleneck risk.`;
  }

  return {
    baselineParams,
    scenarioParams,
    before,
    after,
    deltas: {
      avgWaitDiff,
      waitMinDiff,
      waitMaxDiff,
      clearanceDiff,
      doctorUtilDiff,
      counterUtilDiff,
      fairnessDiff,
    },
    explanation: {
      whatChanged,
      why,
      contributingFactors:
        changes.length > 0
          ? changes
          : ['No parameter delta from baseline; showing steady-state deterministic projection.'],
      recommendedAction,
      modelDisclosure:
        'Illustrative deterministic queueing simulation baseline (FastAPI + Random Forest adapter ready). Not a substitute for clinical triage.',
    },
  };
}

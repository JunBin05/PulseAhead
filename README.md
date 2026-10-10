# PulseAhead

PulseAhead is an early-warning concept for detecting instability in emergency department (ED) operations. Instead of forecasting patient arrivals alone, it looks at how delays in patient inflow, ED processing, and patient outflow can combine to create a growing queue.

## What it aims to do

- Estimate how soon ED demand may exceed effective processing capacity.
- Identify the main operational bottleneck, such as inpatient bed availability, diagnostic delays, or a surge in arrivals.
- Estimate the likely effect on waiting times and highlight actions that could help stabilize flow.

## How it works

The system models ED operations as three connected stages:

1. **Inflow:** walk-in and ambulance arrivals, including acuity and expected arrival times.
2. **Throughput:** triage, clinical assessment, diagnostics, and treatment capacity.
3. **Outflow:** discharge, transfer, and admission capacity, including delays caused by unavailable ward beds.

When arrivals (λ) are expected to remain above the ED's effective processing rate (μ), the queue grows. PulseAhead aims to warn staff before that imbalance becomes critical, explain the likely bottleneck, and support operational decisions.

## Intended users

ED charge nurses and clinical leads, hospital operations teams, laboratory and radiology leads, and ambulance coordination teams.

## Demo direction

A demonstration can compare a stable ED state with a near-instability scenario. It can show estimated time to tipping point, confidence, primary and secondary bottlenecks, predicted waiting-time change, and prioritized operational actions.

## Data and safety

The concept uses time-stamped patient-flow and resource signals, such as arrivals, queue lengths, staffing, diagnostic turnaround, available ED spaces, boarded patients, and ward beds. Any real deployment would require approved data governance and privacy controls. Predictions should show uncertainty and support staff judgment; they should not replace clinical judgment. Simulated inputs must be clearly labeled as simulated.

## Project status

This repository contains the project concept and planning materials. The README describes the intended system; it does not imply that a predictive model or live hospital integration is already implemented.

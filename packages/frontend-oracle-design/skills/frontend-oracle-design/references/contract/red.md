# Contract test writing and real product RED

Prerequisites: approved immutable matching lock, explicit Delivery and invoked `$test`, current source/
target snapshot and supported reporter. Write tests only within approved cases/files and locked scan root.
Real target/control/barrier/observations follow source-approved realization plans. No tests on held rows.
Expected outcomes come from approved contract, never current behavior. For changed existing behavior
retain approved as-is/to-be and falsify the intended change. Harness/compiler/environment failure is not
product RED. Deterministic failing product evidence must be accepted VALID_RED through existing runtime
before any production edit. ALREADY_SATISFIED is zero-production verification, never a manufactured RED.
Harness repairs follow `$test` permissions and shared budget, no expected-outcome weakening or sleeps.

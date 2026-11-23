# Open-source component review / 19 October 2026

- Fleetbase: inspected repository and actual LICENSE.md, GNU AGPL v3. Its documented REST/webhook and logistics extension approach is relevant for a future separate adapter. No Fleetbase code is copied or bundled. https://github.com/fleetbase/fleetbase / https://github.com/fleetbase/fleetbase/blob/main/LICENSE.md
- OmniSupply: inspected the supplied repository. Licence declarations require reconciliation before reuse; the exact LICENSE fetch did not complete in this run. No code is copied or bundled, and permissive reuse is not assumed. The platform's operational constraints and authority do not depend on multi-agent prose. https://github.com/Bhardwaj-Saurabh/OmniSupply-AI-Multi-Agent-Supply-Chain-Intelligence-Platform
- WorldPulse: the supplied xenosaac repository could not be retrieved in this run. Legal terms and maintainability remain unverified. No similarly named repository was substituted and no code is copied. https://github.com/xenosaac/WorldPulse
- OR-Tools: primary repository identifies Apache 2.0. It was considered, but the current Sites Worker cannot run its native Python/C++ runtime. No OR-Tools service is deployed. https://github.com/google/or-tools
- Implemented alternative: javascript-lp-solver 1.0.3, installed from npm and verified locally against its bundled Unlicense file. Its mixed integer model runs in the Worker without native binaries. The constraint and execution validation are original product code. https://github.com/JWally/jsLPSolver / https://github.com/JWally/jsLPSolver/blob/master/LICENSE

This is a component decision record, not a general legal opinion or a claim that every market project is suitable for proprietary reuse.

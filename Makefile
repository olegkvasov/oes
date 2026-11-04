.PHONY: dev mock check test build e2e perf lint format
dev mock check test build lint format:
	yarn run $@
e2e:
	node tests/e2e/run.mjs
perf:
	node --import tsx tests/performance/run.ts

.PHONY: help setup dev hatch hatch-local

help:
	@echo ""
	@echo "  Flying Apps"
	@echo "  ==========="
	@echo ""
	@echo "  make setup        — check tools and print what's next"
	@echo "  make dev          — serve the site locally at http://localhost:8000"
	@echo "  make hatch        — fire the GitHub Actions hatch workflow (uses your sub)"
	@echo "  make hatch-local  — run the offline Python hatchery (needs ANTHROPIC_API_KEY)"
	@echo ""

setup:
	@./scripts/setup

dev:
	@./scripts/dev

hatch:
	@./scripts/hatch $(ARGS)

hatch-local:
	@./scripts/hatch-local $(ARGS)

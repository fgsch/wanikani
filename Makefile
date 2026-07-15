.DEFAULT_GOAL := help

.PHONY: help check format format-check lint test clean

help: ## Show available targets
	@awk 'BEGIN { FS = ":.*## " } \
		/^[[:alnum:]_-]+:.*## / { printf "\033[36m%-30s\033[0m %s\n", $$1, $$2 }' \
		$(MAKEFILE_LIST)

check: format-check lint test ## Run formatting check, lint and tests

format: node_modules ## Format code
	npm run format

format-check: node_modules ## Check formatting
	npm run format:check

lint: node_modules ## Run eslint
	npm run lint

test: node_modules ## Run tests
	npm test

clean: ## Remove build artifacts
	rm -rf node_modules

node_modules: package-lock.json
	npm install

.PHONY: check check-syntax ci clean test

check: node_modules check-syntax test

check-syntax:
	node --check wk-dark-theme.js
	node --check wk-redo-answer.js
	node --check wk-stroke-order.js

ci:
	npm ci
	$(MAKE) check-syntax
	npm test

clean:
	rm -rf node_modules

node_modules: package-lock.json
	npm install

test: node_modules
	npm test

.PHONY: build preview check verify all clean

build:   ## Build src/ into dist/
	@python3 scripts/build.py

preview: build  ## Build, then serve dist/ at localhost:4173
	@echo "→ http://localhost:4173"
	@cd dist && python3 -m http.server 4173

check:   ## Fail if dist/ is out of date with src/
	@python3 scripts/build.py --check

verify:  ## Check dist/ is shippable
	@python3 scripts/verify.py

all: build verify  ## Build and verify

clean:   ## Remove dist/
	@rm -rf dist && echo "removed dist/"

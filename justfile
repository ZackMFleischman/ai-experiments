# Convenience wrappers for the independent workspaces in this umbrella repo.

loom-install:
	cd loom && pnpm install

loom-dev:
	cd loom && pnpm dev

loom-sidecar:
	cd loom && pnpm sidecar

loom-typecheck:
	cd loom && pnpm typecheck

loom-test:
	cd loom && pnpm test

loom-validate:
	cd loom && pnpm validate

loom-validate-stdlib:
	cd loom && pnpm validate:stdlib

parlor-install:
	cd parlor && pnpm install

parlor-typecheck:
	cd parlor && pnpm typecheck

parlor-test:
	cd parlor && pnpm test

hive-install:
	cd hive && pnpm install

hive-dev:
	cd hive && pnpm dev

hive-typecheck:
	cd hive && pnpm typecheck

hive-test:
	cd hive && pnpm test

hive-validate:
	cd hive && pnpm validate

lex-install:
	cd lex && pnpm install

lex-dev:
	cd lex && pnpm dev

lex-typecheck:
	cd lex && pnpm typecheck

lex-test:
	cd lex && pnpm test

lex-validate:
	cd lex && pnpm validate

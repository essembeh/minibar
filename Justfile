# Task runner for Minibar — the recipes mirror .github/workflows/build.yml.
# NixOS: no dev tool is in PATH, so node and glib-compile-schemas come from
# nix-shell and the EGO review linter from uvx (see CLAUDE.md).

uuid := "minibar@essembeh.org"
zip_name := uuid + ".shell-extension.zip"
# Shipped files, kept in sync with the CI "Build the archive" step. Globbed:
# src/ holds only shipped code (dev helpers live in tests/), and the CI asserts
# that every file of src/ made it into the archive.
sources := "*.js *.css metadata.json schemas/"
# List the available recipes
default:
    @just --list

# The linter runs on the packed zip: on src/ it would flag the local
# gschemas.compiled, which is kept there for the symlink install.

# Pre-upload barrier: syntax check + the EGO linter on the uploadable zip
# (CI additionally checks the archive layout, metadata and completeness)
check: syntax pack (shexli zip_name)

# Read from stdin: `node --check file.js` parses as CJS and chokes on `import`.

# ESM syntax check of every shipped module — CI "Syntax check" step
syntax:
    nix-shell -p nodejs-slim --run 'for f in src/*.js; do node --input-type=module --check < "$f" || exit 1; done'

# Experimental tool, deliberately not pinned: the review runs whatever is current.
# realpath: shexli 0.2.1 crashes on a relative path (ValueError in engine.py).

# Static analyzer used by the extensions.gnome.org reviewers
shexli target="src":
    uvx shexli "$(realpath {{target}})"

# Recompile the gschema, required after any change to schemas/*.xml
schemas:
    nix-shell -p glib --run 'glib-compile-schemas src/schemas/'

# Iteration loop: kill and relaunch after any JS change (ESM modules load once
# per process). Never run two nested shells at once.

# Nested GNOME Shell (devkit) with only this extension enabled
nested: schemas
    ./tests/nested.sh

# gschemas.compiled stays in src/ for the symlink install, but EGO compiles the
# schema itself and flags the shipped artifact (shexli EGO-P-006).

# Build the uploadable zip — same content as the CI "Build the archive" step
pack:
    rm -f "{{zip_name}}"
    cd src && zip -qr "../{{zip_name}}" {{sources}} -x 'schemas/gschemas.compiled'
    @echo "built {{zip_name}}"

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Customer Portal — Nuxt 3 (Vue) app, sibling to `tms-frontend` and `wms-frontend` in this
monorepo-of-apps. Feature code lives in `features/<feature>/`.

## PDF generation

`lib/pdf/` follows a dedicated convention, imported here so it stays in context:

@.claude/rules/pdf-generation.md

To perform a migration onto that pipeline, use the **`pdf-refactor`** subagent.

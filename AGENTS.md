# AGENTS.md

## Development

- Keep changes focused and avoid unrelated rewrites.
- Prefer existing project patterns before introducing new structure.
- Run relevant checks before handing off changes.
- Do not overwrite or discard user changes without explicit approval.

## Commit Message Style

Use this format:

```text
[type] description
```

Allowed types:

```text
feat | fix | refactor | docs | test | chore
```

Example:

```text
[feat] add user profile page
```

Commit changes as separate commits when they cover multiple independent concerns
(one concern per commit):

```text
[feat] add toc page injection option
[feat] restore last opened toc file
```

If the concerns cannot be cleanly separated because they share the same files,
a coarse-grained single commit is acceptable.

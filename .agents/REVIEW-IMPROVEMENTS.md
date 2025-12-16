# Comprehensive Review: AGENTS.md and .agents Files

## Executive Summary

Overall, the documentation is well-structured and comprehensive. However, there are several areas for improvement including inconsistencies, missing information, unclear instructions, and opportunities for better cross-referencing.

## Critical Issues

### 1. Missing `eslint-plugin` in Quick Sync Guide

**Location**: `.agents/quick-sync-guide.md`

**Issue**: The quick sync guide only lists 5 repos, missing `eslint-plugin` in all examples.

**Current** (lines 30-34, 40, 49):
```bash
cd obsidian-api && git pull && cd ..
cd obsidian-sample-plugin && git pull && cd ..
cd obsidian-developer-docs && git pull && cd ..
cd obsidian-plugin-docs && git pull && cd ..
cd obsidian-sample-theme && git pull && cd ..
```

**Should be**: Include `eslint-plugin` in all examples.

**Impact**: Users won't update the eslint-plugin repo when syncing.

---

### 2. Inconsistent Repo Count References

**Location**: Multiple files

**Issue**: Some places say "5 core projects", others say "6 core projects". Need consistency.

**Found in**:
- `AGENTS.md` line 65: Lists 5 repos (missing eslint-plugin)
- `quick-sync-guide.md`: All examples show 5 repos
- But `AGENTS.md` line 98 correctly lists all 6

**Fix**: Update all references to consistently say "6 core projects" and include eslint-plugin.

---

### 3. Option 0 vs Option 1 Confusion

**Location**: `AGENTS.md` lines 56-100

**Issue**: "Option 0: Check for Updates / 'What's the Latest'" and "Option 1: Check for Updates to Reference Documentation" have significant overlap and confusing distinction.

**Current**:
- Option 0: Check for updates (read-only, shows what's new)
- Option 1: Check for updates to reference documentation (same thing?)

**Problem**: The distinction is unclear. Both seem to do the same thing.

**Recommendation**: 
- Merge into a single "Check for Updates" option
- Or clarify: Option 0 = quick check (read-only), Option 1 = full sync workflow

---

## Important Improvements

### 4. Missing Symlink Detection in Quick Sync Guide

**Location**: `.agents/quick-sync-guide.md`

**Issue**: The guide doesn't explain how to determine if you're using symlinks vs local clones before running commands.

**Current**: Jumps straight to commands without checking setup.

**Recommendation**: Add a "Determine Your Setup" section at the start (similar to what we added to `sync-procedure.md`).

---

### 5. Incomplete Quick Reference

**Location**: `.agents/quick-reference.md`

**Issues**:
- Line 138: Only lists 5 repos in sync section (missing eslint-plugin)
- Missing reference to `release-readiness.md` 
- No mention of symlink detection

**Recommendation**: 
- Add eslint-plugin to sync commands
- Add release-readiness checklist to quick reference
- Add note about checking symlinks first

---

### 6. Environment.md Build Instructions Inconsistency

**Location**: `.agents/environment.md`

**Issue**: Line 37 says "If npm is not installed, install it first with `npm install`" - but `npm install` installs dependencies, not npm itself.

**Current** (line 37):
```markdown
If npm is not installed, install it first with `npm install` (or install Node.js if npm is not available).
```

**Should be**: 
```markdown
If npm is not installed, install Node.js (which includes npm). Do not run `npm install` to install npm itself - that command installs project dependencies.
```

**Same issue** on line 77 for themes.

---

### 7. Missing Cross-Reference: Release Readiness

**Location**: Multiple files

**Issue**: `release-readiness.md` is not referenced in key places where it should be:
- `quick-reference.md` - should mention release checklist
- `versioning-releases.md` - already has it (good!)
- `AGENTS.md` Navigation section - already has it (good!)

**Recommendation**: Add reference in `quick-reference.md` under a "Release Preparation" section.

---

### 8. AGENTS.md "When to Check .ref Folder Setup" Section

**Location**: `AGENTS.md` lines 28-48

**Issue**: The instructions say to check `.ref/obsidian-api` but don't mention that it might be a symlink pointing elsewhere.

**Current** (line 42):
```
1. Check if `.ref/obsidian-api` exists
2. If missing, run setup script
```

**Recommendation**: Add note that `.ref` contains symlinks, and if checking fails, verify symlink target.

---

### 9. Quick Sync Guide Missing Symlink Instructions

**Location**: `.agents/quick-sync-guide.md`

**Issue**: The guide assumes you know whether you're using symlinks or local clones, but doesn't explain how to check.

**Recommendation**: Add a section at the top:
```markdown
## Determine Your Setup First

Before syncing, check if `.ref` contains symlinks or actual repos:

**Windows (PowerShell)**:
```powershell
Get-Item .ref/obsidian-api | Select-Object LinkType, Target
# If LinkType shows "Junction" or "SymbolicLink", you're using symlinks
```

**macOS/Linux**:
```bash
ls -la .ref/obsidian-api
# If it shows "->" with a path, it's a symlink
```
```

---

### 10. Option 0 Instructions Use Wrong Path

**Location**: `AGENTS.md` line 69

**Issue**: Shows `cd .ref/obsidian-api` but doesn't account for symlinks.

**Current**:
```bash
cd .ref/obsidian-api  # or other repo
git fetch
```

**Problem**: If using symlinks, this won't work. Need to navigate to actual target.

**Recommendation**: Add note about checking symlink target first, or use the central location path.

---

## Minor Improvements

### 11. Build Workflow Could Reference Troubleshooting

**Location**: `.agents/build-workflow.md`

**Issue**: When build fails, it says "check for errors" but doesn't point to troubleshooting resources.

**Recommendation**: Add cross-reference to `troubleshooting.md` and `common-pitfalls.md`.

---

### 12. Missing eslint-plugin in Option 0/1 Examples

**Location**: `AGENTS.md` lines 65, 86

**Issue**: When listing repos to check, only mentions 5, missing eslint-plugin.

**Current** (line 65):
```
- **For core Obsidian projects**: Check `.ref/` root (obsidian-api, obsidian-sample-plugin, obsidian-developer-docs, obsidian-plugin-docs, obsidian-sample-theme)
```

**Should include**: eslint-plugin

---

### 13. Quick Reference Missing Release Readiness

**Location**: `.agents/quick-reference.md`

**Issue**: No mention of release readiness checklist, which is a critical workflow step.

**Recommendation**: Add section:
```markdown
## Release Preparation

Before releasing:
- Run release readiness check: See [release-readiness.md](release-readiness.md)
- Verify all checklist items
```

---

### 14. Agent Do's/Don'ts Could Reference Release Readiness

**Location**: `.agents/agent-dos-donts.md`

**Issue**: Doesn't mention the release readiness workflow.

**Recommendation**: Add:
```markdown
- **Release preparation**: When user asks "is my plugin ready for release?", use [release-readiness.md](release-readiness.md) checklist
```

---

### 15. Sync Procedure Prerequisites Missing eslint-plugin

**Location**: `.agents/sync-procedure.md` line 26

**Issue**: Prerequisites section only mentions 5 repos (missing eslint-plugin).

**Current**:
```
- Optionally clone `obsidian-sample-theme` to `.ref/obsidian-sample-theme` (for theme patterns reference)
```

**Should add**: eslint-plugin to the list.

**Note**: Actually, this is already fixed in the updated version - it lists all 6. But verify it's complete.

---

## Structural Improvements

### 16. AGENTS.md Navigation Could Be More Scannable

**Location**: `AGENTS.md` lines 182-231

**Issue**: Long list of files without clear grouping by use case.

**Recommendation**: Consider adding a "Quick Links by Task" section:
```markdown
## Quick Links by Task

- **Starting a new project** → [project-overview.md](.agents/project-overview.md), [environment.md](.agents/environment.md)
- **Making code changes** → [build-workflow.md](.agents/build-workflow.md), [common-tasks.md](.agents/common-tasks.md)
- **Preparing for release** → [release-readiness.md](.agents/release-readiness.md), [versioning-releases.md](.agents/versioning-releases.md)
- **Troubleshooting** → [troubleshooting.md](.agents/troubleshooting.md), [common-pitfalls.md](.agents/common-pitfalls.md)
```

---

### 17. Missing "How to Use This Documentation" Guide

**Location**: `AGENTS.md`

**Issue**: New users might not understand the structure.

**Recommendation**: Add a brief "How to Use This Documentation" section after Quick Start explaining:
- When to read which files
- The difference between general and project-specific files
- How the .ref folder works

---

## Documentation Quality

### 18. Some Files Reference Outdated Information

**Location**: Various

**Issue**: Some files still reference "5 core projects" or missing eslint-plugin.

**Action**: Global search and replace to ensure all references are consistent.

---

### 19. Cross-References Could Be More Complete

**Location**: Multiple files

**Issue**: Some related topics don't cross-reference each other.

**Examples**:
- `release-readiness.md` references `versioning-releases.md` but not `testing.md` (platform testing)
- `testing.md` doesn't reference `release-readiness.md` (testing is part of release checklist)
- `security-privacy.md` references `release-readiness.md` but not `manifest.md` (manifest has security implications)

**Recommendation**: Review all files and add strategic cross-references.

---

### 20. Missing "What Changed" Section

**Location**: `AGENTS.md`

**Issue**: No changelog or "What's New" section for tracking updates to the documentation itself.

**Recommendation**: Consider adding a section or pointing to `sync-status.json` for tracking updates.

---

## Summary of Priority Fixes

### High Priority (Fix Immediately)
1. ✅ Add eslint-plugin to `quick-sync-guide.md` (all examples)
2. ✅ Fix Option 0/1 confusion in `AGENTS.md`
3. ✅ Add symlink detection to `quick-sync-guide.md`
4. ✅ Fix npm install confusion in `environment.md`

### Medium Priority (Fix Soon)
5. Add release-readiness to `quick-reference.md`
6. Update all "5 core" references to "6 core"
7. Add cross-references between related files
8. Fix Option 0 instructions to handle symlinks

### Low Priority (Nice to Have)
9. Add "Quick Links by Task" to AGENTS.md
10. Add "How to Use This Documentation" guide
11. Improve scannability of navigation section
12. Add changelog/tracking section

---

## Files Needing Updates

1. **AGENTS.md** - Fix Option 0/1, add eslint-plugin references, improve navigation
2. **quick-sync-guide.md** - Add eslint-plugin, add symlink detection
3. **quick-reference.md** - Add eslint-plugin, add release-readiness
4. **environment.md** - Fix npm install confusion
5. **agent-dos-donts.md** - Add release-readiness reference
6. **All files** - Ensure consistent "6 core projects" language

---

## Notes

- Most issues are minor inconsistencies or missing cross-references
- The core structure is solid and well-organized
- The recent addition of `release-readiness.md` is excellent but needs better integration
- The symlink vs local clone distinction needs to be clearer throughout


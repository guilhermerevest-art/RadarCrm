# PR Review Toolkit

A comprehensive collection of specialized agents for thorough pull request review.

## Agents

### 1. comment-analyzer
**Focus**: Code comment accuracy and maintainability
- Comment accuracy vs actual code
- Documentation completeness
- Comment rot and technical debt
- Misleading or outdated comments

### 2. pr-test-analyzer
**Focus**: Test coverage quality and completeness
- Behavioral vs line coverage
- Critical gaps in test coverage
- Test quality and resilience
- Edge cases and error conditions

### 3. silent-failure-hunter
**Focus**: Error handling and silent failures
- Silent failures in catch blocks
- Inadequate error handling
- Inappropriate fallback behavior
- Missing error logging

### 4. type-design-analyzer
**Focus**: Type design quality and invariants
- Type encapsulation (rated 1-10)
- Invariant expression (rated 1-10)
- Type usefulness (rated 1-10)
- Invariant enforcement (rated 1-10)

### 5. code-reviewer
**Focus**: General code review for project guidelines
- CLAUDE.md compliance
- Style violations
- Bug detection
- Code quality issues

### 6. code-simplifier
**Focus**: Code simplification and refactoring
- Code clarity and readability
- Unnecessary complexity and nesting
- Redundant code and abstractions
- Consistency with project standards

## Usage

Simply ask questions that match an agent's focus area:

```
"Can you check if the tests cover all edge cases?"
→ Triggers pr-test-analyzer

"Review the error handling in the API client"
→ Triggers silent-failure-hunter

"I've added documentation - is it accurate?"
→ Triggers comment-analyzer
```

## Recommended Workflow

1. Write code → **code-reviewer**
2. Fix issues → **silent-failure-hunter** (if changed error handling)
3. Add tests → **pr-test-analyzer**
4. Document → **comment-analyzer**
5. Review passes → **code-simplifier** (polish)
6. Create PR

## Tips

- Be specific: Target specific agents for focused review
- Use proactively: Run before creating PRs, not after
- Address critical issues first: Agents prioritize findings
- Iterate: Run again after fixes to verify

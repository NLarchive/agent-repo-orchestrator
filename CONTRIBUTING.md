# 🤝 Contributing Guide

**Status**: v1.0 | **Last Updated**: November 3, 2025

Welcome! We're excited that you're interested in contributing to **Agent Repo Orchestrator**. This guide explains how to contribute code, documentation, issues, and feedback.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git
- npm or yarn

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/agent-repo-orchestrator.git
cd agent-repo-orchestrator

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your local settings

# Start services
docker-compose up -d

# Start the orchestrator
npm run dev
```

### Running Tests

```bash
# Run all tests
npm run test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test -- --coverage

# Watch mode (rerun on file changes)
npm run test:watch
```

---

## 📋 Types of Contributions

### 🐛 Report a Bug

**Before submitting a bug report:**
1. Check the [GitHub Issues](https://github.com/yourusername/agent-repo-orchestrator/issues) to avoid duplicates
2. Update to the latest version
3. Check the [documentation](../docs/INDEX.md) and [troubleshooting guide](../docs/06-operations/)

**When submitting a bug report, include:**
- Clear, descriptive title
- Exact reproduction steps
- Expected vs actual behavior
- Screenshots or error logs (if applicable)
- Your environment (OS, Node version, Docker version)
- Relevant code or configuration

**Example**:
```
Title: DAG resolver throws error with circular dependency

Steps to reproduce:
1. Create workflow with steps: A→B→C→A
2. Submit workflow via POST /api/workflows
3. Error occurs

Expected: Friendly error message about circular dependency
Actual: "TypeError: Cannot read property 'id' of undefined"

Environment: Node 18.17, Docker 24.0, macOS 13.5
```

### ✨ Suggest an Enhancement

**Before suggesting an enhancement:**
1. Check [GitHub Discussions](https://github.com/yourusername/agent-repo-orchestrator/discussions) for similar ideas
2. Check the [roadmap](../docs/07-analysis/IMPLEMENTATION_STATUS.md)

**When suggesting, include:**
- Clear use case and business value
- How it would be used
- Alternative approaches (if any)
- Estimated effort (if possible)

**Example**:
```
Title: Add webhook support for workflow completion events

Use Case: Send notifications when fraud detection workflow completes

Proposed Solution:
- Add webhook URL to workflow spec
- POST to webhook on workflow completion with execution details
- Retry failed webhooks (exponential backoff)

Value: Enables real-time alerts and integrations without polling
```

### 📚 Improve Documentation

Documentation contributions are highly valued!

**Areas that need help:**
- Typo fixes and clarity improvements
- Additional examples and use cases
- Deployment guides for different platforms
- Tutorial content for beginners
- Translations (starting with Spanish)

**To contribute documentation:**
1. Edit the relevant `.md` file in `docs/`
2. Preview locally: `# Just use any markdown viewer`
3. Submit a pull request
4. Ensure links still work in the [INDEX](../docs/INDEX.md)

---

## 💻 Submit Code Changes

### 1. Fork the Repository

```bash
# Click "Fork" on GitHub
git clone https://github.com/YOUR_USERNAME/agent-repo-orchestrator.git
cd agent-repo-orchestrator
git remote add upstream https://github.com/yourusername/agent-repo-orchestrator.git
```

### 2. Create a Feature Branch

```bash
# Update main
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feat/your-feature-name
# or for bug fixes
git checkout -b fix/bug-name
# or for documentation
git checkout -b docs/improvement-name
```

**Branch naming conventions:**
- `feat/...` - New features
- `fix/...` - Bug fixes
- `docs/...` - Documentation
- `refactor/...` - Code refactoring
- `test/...` - Test improvements
- `chore/...` - Tooling, dependencies

### 3. Make Your Changes

**Code style guidelines:**
- Follow the existing code style (ESLint configured)
- 2-space indentation
- Use descriptive variable names
- Add comments for complex logic
- Keep functions small and focused

**Example**:
```javascript
// ✅ Good
const validateWorkflow = (workflow) => {
  // Check required fields
  if (!workflow.name) throw new Error('Workflow must have a name');
  if (!workflow.steps) throw new Error('Workflow must have steps');
  
  // Validate step structure
  workflow.steps.forEach(step => {
    validateStep(step);
  });
};

// ❌ Avoid
const validate = (w) => {
  if (!w.name || !w.steps) throw 'Invalid';
  w.steps.forEach(s => validateStep(s));
};
```

### 4. Write/Update Tests

**For every code change, include tests:**

```javascript
// Test file example: orchestrator/tests/unit/my-feature.test.js
describe('MyFeature', () => {
  test('should handle happy path', () => {
    const result = myFunction(validInput);
    expect(result).toBe(expectedOutput);
  });
  
  test('should throw error on invalid input', () => {
    expect(() => myFunction(invalidInput)).toThrow();
  });
  
  test('should handle edge case', () => {
    // ...
  });
});
```

**Test coverage requirements:**
- New features: ≥80% coverage
- Bug fixes: Include regression tests
- Documentation: No test required

### 5. Run Tests & Linting

```bash
# Run all tests
npm run test

# Check coverage
npm run test -- --coverage

# Lint code
npm run lint

# Fix linting issues
npm run lint -- --fix
```

**All tests must pass before submitting a PR.**

### 6. Commit Your Changes

```bash
# Add changes
git add orchestrator/my-feature.js orchestrator/tests/unit/my-feature.test.js

# Commit with clear message
git commit -m "feat: add new feature for X

- Detailed description of what was added
- Why this change is needed
- Related issue #123"
```

**Commit message guidelines:**
- Start with type: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Use imperative mood ("add" not "added")
- Keep first line under 72 characters
- Reference related issues: `Fixes #123`, `Related to #456`

### 7. Push & Create Pull Request

```bash
# Push to your fork
git push origin feat/your-feature-name

# Go to GitHub and click "Create Pull Request"
```

**Pull request template:**
```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactoring

## Related Issue
Fixes #123 (if applicable)

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests passing
- [ ] Documentation updated
```

### 8. Respond to Reviews

- Be open to feedback
- Ask clarifying questions if needed
- Make requested changes promptly
- Push updates to the same branch
- Resolve conversations when addressed

---

## 🔄 Development Workflow

### Issue → PR → Review → Merge

```
1. Find an issue or create one
   ↓
2. Assign to yourself
   ↓
3. Create feature branch from main
   ↓
4. Make changes with tests
   ↓
5. Push and create PR
   ↓
6. CI/CD tests run automatically
   ↓
7. Code review by maintainers
   ↓
8. Address feedback (if any)
   ↓
9. Merge to main
   ↓
10. Deploy to production (maintainer only)
```

---

## 📦 Adding Dependencies

**Before adding a new dependency:**
1. Check if it's already installed
2. Verify it's actively maintained
3. Check security advisories
4. Ensure it aligns with project goals
5. Discuss in an issue first

**To add a dependency:**
```bash
# Add to production
npm install package-name

# Add to dev dependencies
npm install --save-dev package-name

# Commit the change
git add package.json package-lock.json
git commit -m "chore: add new dependency package-name"
```

---

## 🐳 Docker & Services

### Running Services Locally

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Stop services
docker-compose down

# Clean up volumes
docker-compose down -v
```

### Services Available
- **NATS**: `nats://localhost:4222`
- **PostgreSQL**: `localhost:5432`
- **MinIO**: `http://localhost:9000`
- **Pathway**: `http://localhost:8000`

---

## 📝 Project Standards

### Code Quality
- ESLint configuration: See `.eslintrc.json`
- Prettier formatting: Configured in `package.json`
- Jest test framework: See `jest.config.js`

### Security
- All new features reviewed for security
- Secrets never hardcoded
- Input validation required
- SQL injection prevention (parameterized queries)

### Documentation
- Code comments for complex logic
- Docstrings for all functions
- README updates for user-facing changes
- Add entries to [docs/INDEX.md](../docs/INDEX.md)

---

## 🎯 Good Issues for Beginners

Looking for where to start? Check issues labeled:
- `good-first-issue` - Perfect for newcomers
- `help-wanted` - Community contributions welcome
- `documentation` - Documentation improvements
- `beginner-friendly` - Suitable for learning

---

## 📚 Resources

- **[Architecture Guide](../docs/02-architecture/ARCHITECTURE.md)** - Understand the system
- **[Testing Guide](../docs/04-testing/TESTING.md)** - How testing works
- **[Security Audit](../docs/05-security/SECURITY_AUDIT.md)** - Security practices
- **[Quick Start](../docs/01-getting-started/QUICK_START.md)** - Get running fast

---

## 🙏 Recognition

All contributors are recognized in:
- GitHub Contributors page
- Release notes
- Contributors section in README (coming soon)

**Thank you for contributing!**

---

## 📞 Questions?

- **GitHub Issues**: Report bugs or ask for help
- **GitHub Discussions**: General questions and ideas
- **Email**: See repository for contact info
- **Documentation**: Check [docs/INDEX.md](../docs/INDEX.md)

---

**Happy contributing!** 🎉

**Last Updated**: November 3, 2025 | **Maintained by**: Agent Repo Orchestrator Team

<!-- Nicolas Larenas, nlarchive -->

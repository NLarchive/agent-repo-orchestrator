/**
 * DAG dependency resolver
 * Performs topological sort and validates workflow DAG
 */
class DagResolver {
  /**
   * Resolve execution order for workflow steps
   * @param {Object} workflow - Workflow specification
   * @returns {Array} - Step IDs in execution order
   */
  static resolve(workflow) {
    const steps = workflow.steps || [];
    const stepMap = new Map(steps.map(s => [s.id, s]));
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (stepId) => {
      if (visited.has(stepId)) {
        return;
      }

      if (visiting.has(stepId)) {
        throw new Error(`Cycle detected in workflow: step "${stepId}" has circular dependency`);
      }

      const step = stepMap.get(stepId);
      if (!step) {
        throw new Error(`Step not found: "${stepId}"`);
      }

      visiting.add(stepId);

      // Visit dependencies first
      const dependencies = step.needs || [];
      for (const depId of dependencies) {
        if (!stepMap.has(depId)) {
          throw new Error(`Dependency not found: step "${stepId}" requires "${depId}"`);
        }
        visit(depId);
      }

      visiting.delete(stepId);
      visited.add(stepId);
      order.push(stepId);
    };

    // Visit all steps
    for (const step of steps) {
      visit(step.id);
    }

    return order;
  }

  /**
   * Get steps that are ready to execute (all dependencies complete)
   * @param {Array} steps - All workflow steps
   * @param {Set} completedStepIds - Set of completed step IDs
   * @returns {Array} - Steps ready for execution
   */
  static getReadySteps(steps, completedStepIds) {
    return steps.filter(step => {
      // Skip if already completed
      if (completedStepIds.has(step.id)) {
        return false;
      }

      // Check if all dependencies are complete
      const dependencies = step.needs || [];
      return dependencies.every(depId => completedStepIds.has(depId));
    });
  }

  /**
   * Validate workflow structure
   * @param {Object} workflow - Workflow specification
   * @returns {Object} - Validation result { valid: boolean, errors: [] }
   */
  static validate(workflow) {
    const errors = [];

    if (!workflow.name) {
      errors.push('Workflow must have a name');
    }

    if (!workflow.steps || !Array.isArray(workflow.steps)) {
      errors.push('Workflow must have steps array');
      return { valid: false, errors };
    }

    if (workflow.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check step structure
    const stepIds = new Set();
    for (const step of workflow.steps) {
      if (!step.id) {
        errors.push('All steps must have an id');
        continue;
      }

      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step id: "${step.id}"`);
      }
      stepIds.add(step.id);

      if (!step.plugin) {
        errors.push(`Step "${step.id}" must specify a plugin`);
      }

      if (!step.action) {
        errors.push(`Step "${step.id}" must specify an action`);
      }
    }

    // Try to resolve DAG
    if (errors.length === 0) {
      try {
        DagResolver.resolve(workflow);
      } catch (error) {
        errors.push(error.message);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = DagResolver;

// Nicolas Larenas, nlarchive

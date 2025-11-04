const DagResolver = require('../../engine/dag-resolver');

describe('DAG Resolver', () => {
  describe('resolve', () => {
    it('should resolve steps in topological order', () => {
      const workflow = {
        steps: [
          { id: 'fetch', needs: [] },
          { id: 'transform', needs: ['fetch'] },
          { id: 'store', needs: ['transform'] }
        ]
      };

      const order = DagResolver.resolve(workflow);
      expect(order).toEqual(['fetch', 'transform', 'store']);
    });

    it('should handle parallel steps', () => {
      const workflow = {
        steps: [
          { id: 'fetch1', needs: [] },
          { id: 'fetch2', needs: [] },
          { id: 'merge', needs: ['fetch1', 'fetch2'] }
        ]
      };

      const order = DagResolver.resolve(workflow);
      expect(order.length).toBe(3);
      expect(order[2]).toBe('merge');
      expect(order.slice(0, 2).sort()).toEqual(['fetch1', 'fetch2']);
    });

    it('should handle complex DAG', () => {
      const workflow = {
        steps: [
          { id: 'a', needs: [] },
          { id: 'b', needs: ['a'] },
          { id: 'c', needs: ['a'] },
          { id: 'd', needs: ['b', 'c'] }
        ]
      };

      const order = DagResolver.resolve(workflow);
      expect(order[0]).toBe('a');
      expect(order[3]).toBe('d');
    });

    it('should detect cycles and throw', () => {
      const workflow = {
        steps: [
          { id: 'a', needs: ['b'] },
          { id: 'b', needs: ['a'] }
        ]
      };

      expect(() => DagResolver.resolve(workflow)).toThrow('Cycle detected');
    });

    it('should detect self-referencing cycle', () => {
      const workflow = {
        steps: [
          { id: 'a', needs: ['a'] }
        ]
      };

      expect(() => DagResolver.resolve(workflow)).toThrow('Cycle detected');
    });

    it('should throw on missing dependency', () => {
      const workflow = {
        steps: [
          { id: 'a', needs: ['nonexistent'] }
        ]
      };

      expect(() => DagResolver.resolve(workflow)).toThrow('Dependency not found');
    });

    it('should handle empty needs array', () => {
      const workflow = {
        steps: [
          { id: 'a', needs: [] },
          { id: 'b', needs: [] }
        ]
      };

      const order = DagResolver.resolve(workflow);
      expect(order.length).toBe(2);
    });
  });

  describe('getReadySteps', () => {
    it('should return steps with no dependencies first', () => {
      const steps = [
        { id: 'fetch', needs: [] },
        { id: 'transform', needs: ['fetch'] }
      ];

      const ready = DagResolver.getReadySteps(steps, new Set());
      expect(ready).toEqual([{ id: 'fetch', needs: [] }]);
    });

    it('should return steps when dependencies complete', () => {
      const steps = [
        { id: 'fetch', needs: [] },
        { id: 'transform', needs: ['fetch'] }
      ];

      const ready = DagResolver.getReadySteps(steps, new Set(['fetch']));
      expect(ready).toEqual([{ id: 'transform', needs: ['fetch'] }]);
    });

    it('should not return completed steps', () => {
      const steps = [
        { id: 'fetch', needs: [] },
        { id: 'transform', needs: ['fetch'] }
      ];

      const ready = DagResolver.getReadySteps(steps, new Set(['fetch', 'transform']));
      expect(ready).toEqual([]);
    });

    it('should handle multiple ready steps', () => {
      const steps = [
        { id: 'a', needs: [] },
        { id: 'b', needs: [] },
        { id: 'c', needs: ['a', 'b'] }
      ];

      const ready = DagResolver.getReadySteps(steps, new Set());
      expect(ready.length).toBe(2);
      expect(ready.map(s => s.id).sort()).toEqual(['a', 'b']);
    });
  });

  describe('validate', () => {
    it('should validate correct workflow', () => {
      const workflow = {
        name: 'test-workflow',
        steps: [
          { id: 'a', plugin: 'p1', action: 'fetch' },
          { id: 'b', plugin: 'p2', action: 'transform', needs: ['a'] }
        ]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject workflow without name', () => {
      const workflow = {
        steps: [{ id: 'a', plugin: 'p1', action: 'fetch' }]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow must have a name');
    });

    it('should reject workflow without steps', () => {
      const workflow = {
        name: 'test'
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow must have steps array');
    });

    it('should reject empty steps array', () => {
      const workflow = {
        name: 'test',
        steps: []
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow must have at least one step');
    });

    it('should reject steps without id', () => {
      const workflow = {
        name: 'test',
        steps: [{ plugin: 'p1', action: 'fetch' }]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('All steps must have an id');
    });

    it('should reject duplicate step ids', () => {
      const workflow = {
        name: 'test',
        steps: [
          { id: 'a', plugin: 'p1', action: 'fetch' },
          { id: 'a', plugin: 'p2', action: 'transform' }
        ]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('should reject steps without plugin', () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'a', action: 'fetch' }]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must specify a plugin'))).toBe(true);
    });

    it('should reject steps without action', () => {
      const workflow = {
        name: 'test',
        steps: [{ id: 'a', plugin: 'p1' }]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must specify an action'))).toBe(true);
    });

    it('should catch cycle during validation', () => {
      const workflow = {
        name: 'test',
        steps: [
          { id: 'a', plugin: 'p1', action: 'fetch', needs: ['b'] },
          { id: 'b', plugin: 'p2', action: 'transform', needs: ['a'] }
        ]
      };

      const result = DagResolver.validate(workflow);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Cycle'))).toBe(true);
    });
  });
});

// Nicolas Larenas, nlarchive

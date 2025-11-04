const DatabaseClient = require('../../db/client');

describe('DatabaseClient', () => {
  let db;

  beforeEach(() => {
    db = new DatabaseClient(':memory:');
    db.connect();
    db.initialize();
  });

  afterEach(() => {
    db.close();
  });

  describe('Plugin operations', () => {
    it('should create plugin', () => {
      const plugin = {
        id: 'test.plugin',
        name: 'Test Plugin',
        image: 'test:latest',
        version: '1.0.0'
      };

      db.createPlugin(plugin);
      const retrieved = db.getPlugin('test.plugin');

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe('test.plugin');
      expect(retrieved.name).toBe('Test Plugin');
    });

    it('should get all plugins', () => {
      db.createPlugin({ id: 'p1', name: 'Plugin 1', image: 'p1:latest', version: '1.0' });
      db.createPlugin({ id: 'p2', name: 'Plugin 2', image: 'p2:latest', version: '1.0' });

      const plugins = db.getAllPlugins();
      expect(plugins.length).toBe(2);
    });

    it('should update plugin', () => {
      db.createPlugin({ id: 'test', name: 'Test', image: 'test:latest', version: '1.0' });
      
      db.updatePlugin('test', {
        digest: 'sha256:abc',
        version: '1.1',
        spec: { id: 'test', image: 'test:latest', version: '1.1' }
      });

      const plugin = db.getPlugin('test');
      expect(plugin.digest).toBe('sha256:abc');
      expect(plugin.version).toBe('1.1');
    });
  });

  describe('Workflow operations', () => {
    it('should create workflow', () => {
      const workflow = {
        id: 'wf-1',
        name: 'Test Workflow',
        spec: { steps: [] }
      };

      db.createWorkflow(workflow);
      const retrieved = db.getWorkflow('wf-1');

      expect(retrieved).toBeDefined();
      expect(retrieved.name).toBe('Test Workflow');
      expect(retrieved.spec).toEqual({ steps: [] });
    });
  });

  describe('Execution operations', () => {
    beforeEach(() => {
      db.createWorkflow({
        id: 'wf-1',
        name: 'Test Workflow',
        spec: { steps: [] }
      });
    });

    it('should create execution', () => {
      const execution = {
        id: 'exec-1',
        workflow_id: 'wf-1',
        status: 'pending'
      };

      db.createExecution(execution);
      const retrieved = db.getExecution('exec-1');

      expect(retrieved).toBeDefined();
      expect(retrieved.workflow_id).toBe('wf-1');
      expect(retrieved.status).toBe('pending');
    });

    it('should update execution status', () => {
      db.createExecution({ id: 'exec-1', workflow_id: 'wf-1' });
      
      db.updateExecution('exec-1', {
        status: 'completed',
        result: { data: 'test' }
      });

      const execution = db.getExecution('exec-1');
      expect(execution.status).toBe('completed');
      expect(execution.result).toEqual({ data: 'test' });
      expect(execution.completed_at).toBeDefined();
    });

    it('should update execution with error', () => {
      db.createExecution({ id: 'exec-1', workflow_id: 'wf-1' });
      
      db.updateExecution('exec-1', {
        status: 'failed',
        error: 'Test error'
      });

      const execution = db.getExecution('exec-1');
      expect(execution.status).toBe('failed');
      expect(execution.error).toBe('Test error');
    });
  });

  describe('Task operations', () => {
    beforeEach(() => {
      db.createWorkflow({ id: 'wf-1', name: 'Test', spec: {} });
      db.createExecution({ id: 'exec-1', workflow_id: 'wf-1' });
      db.createPlugin({ id: 'p1', name: 'Plugin', image: 'p1:latest', version: '1.0' });
    });

    it('should create task', () => {
      const task = {
        id: 'task-1',
        execution_id: 'exec-1',
        step_id: 'step-1',
        plugin_id: 'p1',
        action: 'fetch',
        input: { url: 'https://example.com' }
      };

      db.createTask(task);
      const retrieved = db.getTask('task-1');

      expect(retrieved).toBeDefined();
      expect(retrieved.step_id).toBe('step-1');
      expect(retrieved.input).toEqual({ url: 'https://example.com' });
    });

    it('should get tasks by execution', () => {
      db.createTask({
        id: 'task-1',
        execution_id: 'exec-1',
        step_id: 'step-1',
        plugin_id: 'p1',
        action: 'fetch'
      });
      db.createTask({
        id: 'task-2',
        execution_id: 'exec-1',
        step_id: 'step-2',
        plugin_id: 'p1',
        action: 'transform'
      });

      const tasks = db.getTasksByExecution('exec-1');
      expect(tasks.length).toBe(2);
    });

    it('should update task status', () => {
      db.createTask({
        id: 'task-1',
        execution_id: 'exec-1',
        step_id: 'step-1',
        plugin_id: 'p1',
        action: 'fetch'
      });

      db.updateTask('task-1', {
        status: 'completed',
        result: { data: 'success' },
        attempts: 1
      });

      const task = db.getTask('task-1');
      expect(task.status).toBe('completed');
      expect(task.result).toEqual({ data: 'success' });
      expect(task.attempts).toBe(1);
    });
  });

  describe('Event operations', () => {
    beforeEach(() => {
      db.createWorkflow({ id: 'wf-1', name: 'Test', spec: {} });
      db.createExecution({ id: 'exec-1', workflow_id: 'wf-1' });
    });

    it('should create event', () => {
      const event = {
        execution_id: 'exec-1',
        event_type: 'step_started',
        data: { stepId: 'step-1' }
      };

      db.createEvent(event);
      const events = db.getEventsByExecution('exec-1');

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('step_started');
      expect(events[0].event_data).toEqual({ stepId: 'step-1' });
    });

    it('should get events in order', () => {
      db.createEvent({ execution_id: 'exec-1', event_type: 'event_1', data: {} });
      db.createEvent({ execution_id: 'exec-1', event_type: 'event_2', data: {} });
      db.createEvent({ execution_id: 'exec-1', event_type: 'event_3', data: {} });

      const events = db.getEventsByExecution('exec-1');
      expect(events.map(e => e.event_type)).toEqual(['event_1', 'event_2', 'event_3']);
    });
  });
});

// Nicolas Larenas, nlarchive

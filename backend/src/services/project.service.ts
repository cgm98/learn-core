import { Project, ProjectWithCounts, ProjectConcept, ProjectConceptDetail, Experiment, Decision, DecisionDetail } from '../../domain/entities/project.entity.js';
import { IProjectRepository } from '../../domain/interfaces/project.repository.interface.js';
import { generateId } from '../utils.js';
import { eventBus } from '../../domain/events.js';
import { NotFoundError } from '../../domain/errors.js';

export class ProjectService {
  constructor(private readonly projectRepository: IProjectRepository) {}

  getAll(userId: string): ProjectWithCounts[] {
    return this.projectRepository.getAll(userId);
  }

  getById(id: string, userId: string): Project | undefined {
    return this.projectRepository.getById(id, userId);
  }

  create(data: Partial<Project>, userId: string): Project {
    const id = data.id || generateId('p');
    const now = new Date().toISOString();

    const newProject = {
      id,
      user_id: userId,
      name: data.name!,
      description: data.description || null,
      status: 'active',
      created_at: now,
      updated_at: now
    };

    this.projectRepository.create(newProject);
    return newProject as Project;
  }

  getConcepts(projectId: string): ProjectConceptDetail[] {
    return this.projectRepository.getConcepts(projectId);
  }

  linkConcept(projectId: string, data: Partial<ProjectConcept>): ProjectConcept {
    const id = generateId('pc');
    const now = new Date().toISOString();

    const pc = {
      id,
      project_id: projectId,
      concept_id: data.concept_id!,
      usage_type: data.usage_type || 'reference',
      created_at: now
    };

    this.projectRepository.linkConcept(pc);

    eventBus.emit('concept.applied', {
      id: pc.id,
      timestamp: now,
      data: { concept_id: pc.concept_id }
    });

    return pc as ProjectConcept;
  }

  unlinkConcept(projectId: string, conceptId: string): void {
    this.projectRepository.unlinkConcept(projectId, conceptId);
  }

  getExperiments(projectId: string): Experiment[] {
    return this.projectRepository.getExperiments(projectId) as Experiment[];
  }

  createExperiment(projectId: string, data: Partial<Experiment>): Experiment {
    const id = generateId('exp');
    const now = new Date().toISOString();

    const exp = {
      id,
      project_id: projectId,
      name: data.name!,
      hypothesis: data.hypothesis || null,
      status: data.status || 'planned',
      outcome: data.outcome || null,
      created_at: now,
      updated_at: now
    };

    this.projectRepository.createExperiment(exp);
    return exp as Experiment;
  }

  updateExperiment(experimentId: string, status: string, outcome?: string | null): Experiment {
    const now = new Date().toISOString();
    this.projectRepository.updateExperimentStatus(experimentId, status, outcome || null, now);
    const updated = this.projectRepository.getExperimentById(experimentId);
    if (!updated) {
      throw new NotFoundError('Experimento no encontrado');
    }
    return updated as Experiment;
  }

  getDecisions(projectId: string): DecisionDetail[] {
    return this.projectRepository.getDecisions(projectId);
  }

  createDecision(projectId: string, data: Partial<Decision>): Decision {
    const id = generateId('dec');
    const now = new Date().toISOString();

    const dec = {
      id,
      project_id: projectId,
      experiment_id: data.experiment_id || null,
      concept_id: data.concept_id!,
      decision: data.decision!,
      rationale: data.rationale || null,
      outcome: data.outcome || null,
      created_at: now
    };

    this.projectRepository.createDecision(dec);
    return dec as Decision;
  }
}

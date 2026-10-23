import { ProjectActivity, ProjectActivitySource } from '../../domain/entities/project-activity.entity.js';
import { IProjectActivityRepository } from '../../domain/interfaces/project-activity.repository.interface.js';
import { IDomainRepository } from '../../domain/interfaces/domain.repository.interface.js';
import { NotFoundError } from '../../domain/errors.js';
import { generateId } from '../utils.js';

const DEFAULT_LIMIT = 50;

export class ProjectActivityService {
  constructor(
    private readonly projectActivityRepository: IProjectActivityRepository,
    private readonly domainRepository: IDomainRepository
  ) {}

  getForDomain(domainId: string, userId: string, limit = DEFAULT_LIMIT): ProjectActivity[] {
    if (!this.domainRepository.findById(domainId, userId)) {
      throw new NotFoundError('Dominio no encontrado');
    }
    return this.projectActivityRepository.getForDomain(domainId, limit);
  }

  log(domainId: string, eventType: string, summary: string, source: ProjectActivitySource): void {
    this.projectActivityRepository.create({
      id: generateId('act'),
      domain_id: domainId,
      event_type: eventType,
      summary,
      source,
      created_at: new Date().toISOString()
    });
  }
}

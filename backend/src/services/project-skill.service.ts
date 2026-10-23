import { ProjectSkill } from '../../domain/entities/project-skill.entity.js';
import { IProjectSkillRepository } from '../../domain/interfaces/project-skill.repository.interface.js';
import { IConceptRepository } from '../../domain/interfaces/concept.repository.interface.js';
import { IDomainRepository } from '../../domain/interfaces/domain.repository.interface.js';
import { NotFoundError, ValidationError } from '../../domain/errors.js';
import { generateId } from '../utils.js';

export class ProjectSkillService {
  constructor(
    private readonly projectSkillRepository: IProjectSkillRepository,
    private readonly conceptRepository: IConceptRepository,
    private readonly domainRepository: IDomainRepository
  ) {}

  getForDomain(domainId: string, userId: string): ProjectSkill[] {
    if (!this.domainRepository.findById(domainId, userId)) {
      throw new NotFoundError('Dominio no encontrado');
    }
    return this.projectSkillRepository.getForDomain(domainId);
  }

  // source 'catalog' referencia una nota de skill ya importada (concept.id real, ver
  // docs/skills-recomendados/); 'local' es una skill propia del sandbox
  // (<local_path>/.claude/skills/), no catalogada acá, así que no se valida contra nada.
  create(data: { domain_id: string; skill_ref: string; source: 'catalog' | 'local' }, userId: string): ProjectSkill {
    if (!this.domainRepository.findById(data.domain_id, userId)) {
      throw new NotFoundError('Dominio no encontrado');
    }
    if (data.source === 'catalog' && !this.conceptRepository.findById(data.skill_ref, userId)) {
      throw new ValidationError(`skill_ref "${data.skill_ref}" no corresponde a ningún concepto existente.`);
    }

    const skill: ProjectSkill = {
      id: generateId('pskill'),
      domain_id: data.domain_id,
      skill_ref: data.skill_ref,
      source: data.source,
      created_at: new Date().toISOString()
    };

    this.projectSkillRepository.create(skill);
    return skill;
  }

  delete(id: string): void {
    if (!this.projectSkillRepository.findById(id)) {
      throw new NotFoundError('Skill no encontrada');
    }
    this.projectSkillRepository.delete(id);
  }
}

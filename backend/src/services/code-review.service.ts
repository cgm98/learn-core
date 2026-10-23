import { CodeReviewRepository } from '../../infrastructure/repositories/code-review.repository.js';
import { CodeReview, CodeReviewStatus } from '../../domain/entities/code-review.entity.js';
import { NotFoundError, ValidationError } from '../../domain/errors.js';
import { generateId } from '../utils.js';

const STATUSES: CodeReviewStatus[] = ['pending', 'changes_requested', 'approved'];

export class CodeReviewService {
  constructor(private readonly codeReviewRepo: CodeReviewRepository) {}

  getAll(userId: string): CodeReview[] {
    return this.codeReviewRepo.getAll(userId);
  }

  getById(id: string, userId: string): CodeReview | undefined {
    return this.codeReviewRepo.findById(id, userId);
  }

  create(data: Partial<CodeReview>, userId: string): CodeReview {
    if (!data.title || !data.title.trim()) throw new ValidationError('title es obligatorio');
    if (data.status && !STATUSES.includes(data.status)) throw new ValidationError(`status inválido: ${data.status}`);

    const now = new Date().toISOString();
    const newReview: CodeReview = {
      id: data.id || generateId('code-review'),
      user_id: userId,
      title: data.title.trim(),
      url: data.url || null,
      dev_id: data.dev_id || null,
      status: data.status || 'pending',
      due_date: data.due_date || null,
      notes: data.notes || null,
      created_at: now,
      updated_at: now
    };
    this.codeReviewRepo.create(newReview);
    return newReview;
  }

  update(id: string, data: Partial<CodeReview>, userId: string): CodeReview {
    const existing = this.codeReviewRepo.findById(id, userId);
    if (!existing) throw new NotFoundError('Code review no encontrada');
    if (data.status !== undefined && !STATUSES.includes(data.status)) throw new ValidationError(`status inválido: ${data.status}`);
    if (data.title !== undefined && !data.title.trim()) throw new ValidationError('title no puede quedar vacío');

    const updated: CodeReview = {
      ...existing,
      title: data.title !== undefined ? data.title.trim() : existing.title,
      url: data.url !== undefined ? data.url : existing.url,
      dev_id: data.dev_id !== undefined ? data.dev_id : existing.dev_id,
      status: data.status !== undefined ? data.status : existing.status,
      due_date: data.due_date !== undefined ? data.due_date : existing.due_date,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      updated_at: new Date().toISOString()
    };
    this.codeReviewRepo.update(updated);
    return updated;
  }

  delete(id: string, userId: string): void {
    const existing = this.codeReviewRepo.findById(id, userId);
    if (!existing) throw new NotFoundError('Code review no encontrada');
    this.codeReviewRepo.delete(id, userId);
  }
}

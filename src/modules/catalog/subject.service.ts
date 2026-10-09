import { Injectable } from '@nestjs/common';
import { Prisma, Subject } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  DuplicatePrerequisiteError,
  SubjectCycleError,
  SubjectNotFoundError,
} from './subject.errors';

@Injectable()
export class SubjectService {
  constructor(private readonly prisma: PrismaService) {}

  async replacePrerequisites(
    subjectId: string,
    prerequisiteSubjectIds: readonly string[],
  ): Promise<Subject> {
    const ids = [...prerequisiteSubjectIds];
    if (new Set(ids).size !== ids.length || ids.includes(subjectId))
      throw new DuplicatePrerequisiteError();
    return this.prisma.$transaction(
      async (tx) => {
        const subjects = await tx.subject.findMany({
          where: { id: { in: [subjectId, ...ids] } },
          select: { id: true },
        });
        if (subjects.length !== new Set([subjectId, ...ids]).size) throw new SubjectNotFoundError();
        const existing = await tx.subjectPrerequisite.findMany({
          select: { subjectId: true, prerequisiteSubjectId: true },
        });
        const edges = existing.filter((edge) => edge.subjectId !== subjectId);
        edges.push(...ids.map((id) => ({ subjectId, prerequisiteSubjectId: id })));
        if (this.hasCycle(edges)) throw new SubjectCycleError();
        await tx.subjectPrerequisite.deleteMany({ where: { subjectId } });
        if (ids.length)
          await tx.subjectPrerequisite.createMany({
            data: ids.map((id) => ({ subjectId, prerequisiteSubjectId: id })),
          });
        return tx.subject.update({ where: { id: subjectId }, data: { version: { increment: 1 } } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private hasCycle(
    edges: readonly { subjectId: string; prerequisiteSubjectId: string }[],
  ): boolean {
    const graph = new Map<string, string[]>();
    for (const edge of edges)
      graph.set(edge.subjectId, [...(graph.get(edge.subjectId) ?? []), edge.prerequisiteSubjectId]);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (node: string): boolean => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of graph.get(node) ?? []) if (visit(next)) return true;
      visiting.delete(node);
      visited.add(node);
      return false;
    };
    return [...graph.keys()].some(visit);
  }
}

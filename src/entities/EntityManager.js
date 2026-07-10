export class EntityManager {
  constructor() {
    this.entities = new Map();
    this.byType = new Map();
  }

  add(entity, type = 'generic') {
    this.entities.set(entity.id, entity);
    if (!this.byType.has(type)) {
      this.byType.set(type, new Set());
    }
    this.byType.get(type).add(entity);
    entity._entityType = type;
    return entity;
  }

  remove(entity) {
    this.entities.delete(entity.id);
    const type = entity._entityType;
    if (type && this.byType.has(type)) {
      this.byType.get(type).delete(entity);
    }
    entity.active = false;
  }

  getByType(type) {
    return this.byType.get(type) || new Set();
  }

  update(deltaTime) {
    for (const entity of this.entities.values()) {
      if (entity.active) {
        entity.update(deltaTime);
      }
    }

    for (const entity of this.entities.values()) {
      if (!entity.active) {
        this.remove(entity);
      }
    }
  }

  clear() {
    this.entities.clear();
    this.byType.clear();
  }
}

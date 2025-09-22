import request from 'supertest';
import app from '../server/src/index';

describe('Schema validation API', () => {
  it('validates ACTOR_SCHEMA with positive payload', async () => {
    const response = await request(app).post('/api/validate').send({
      schema_ref: 'ACTOR_SCHEMA',
      data: {
        name: 'Бабушка Валя',
        age_range: '60+',
        traits: ['ласковая', 'юморная', 'энергичная'],
        bio: 'Ведёт ZOOM-занятия по танцам с внуками.',
        visual_prompt: 'Седая бабушка в ярком свитере, улыбается, танцует',
        voice_prompt: 'Тёплый и задорный голос, лёгкий смешок в конце фраз',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true, errors: [] });
  });

  it('reports error for invalid payload', async () => {
    const response = await request(app).post('/api/validate').send({
      schema_ref: 'PLAN_SCHEMA',
      data: { overview: {} },
    });

    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
    expect(Array.isArray(response.body.errors)).toBe(true);
  });
});

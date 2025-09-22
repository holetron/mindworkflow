# Local Creative Flow

## Описание
Local Creative Flow — офлайн-первый моно-репозиторий для визуального планирования творческих проектов. Вместо запуска конечного пайплайна как в n8n мы собираем mindmap: узлы описывают шаги и артефакты, связи помогают видеть, что, зачем и из каких входов получится. В проекте собраны Vite/React UI, Node.js/Express сервер, SQLite база, валидаторы схем и заглушки для ИИ/медиа узлов и Python-песочницы.

### Концепция
- **Mindmap проекта.** Граф используется как карта контента: от брифа и сценариев до изображений, видео и итоговых файлов.
- **ИИ-ноды — точечная генерация.** Агент получает входы (текст, изображения, аудио) и возвращает ограниченный набор артефактов, например персонажа, сцену или документ.
- **Ноды-папки.** Папка накапливает результаты генераций. Из неё можно перетаскивать лучшие варианты обратно в граф и подключать к новым агентам.
- **Комбинирование узлов.** Например, текстовый промпт + reference-изображения → Midjourney-агент → Папка с сгенерированными кадрами → выбор лучшего → повторная генерация с другим агентом.
- **Фокус на сборке проекта.** Цель — собрать весь набор материалов для командной работы, а не запустить автозадачу.

## Требования
- Node.js 20 LTS и npm 10+
- Python 3.10+ с поддержкой `venv`
- FFmpeg в `PATH` (используется видео-заглушкой; при отсутствии создаётся заглушечный файл)
- macOS, Linux или Windows с Bash-совместимой оболочкой

## Установка
```bash
npm install
```

## Структура
```
.
├─ app/                     # Vite + React + Tailwind клиент
├─ server/                  # Express + TypeScript сервер
├─ projects/proj_2025_09_19_001/
│  ├─ project.flow.json     # Демо «Реклама чипсов»
│  ├─ assets/
│  └─ project_output/
├─ data/localcreativeflow.db# SQLite база (создаётся автоматически)
├─ tests/                   # Jest + supertest
└─ README_LOCAL.md
```

## Команды
- `npm run dev` — параллельный запуск сервера (порт 4321) и клиента (порт 5173)
- `npm run build` — сборка сервера и клиента
- `npm test` — Jest-тесты (AJV, проекты, ноды)
- `npm --prefix server run dev|build|start|test`
- `npm --prefix app run dev|build|preview`

## API (curl)
```bash
# Импорт проекта
curl -X POST http://localhost:4321/api/project \
  -H 'Content-Type: application/json' \
  -d @projects/proj_2025_09_19_001/project.flow.json

# Получить проект
curl http://localhost:4321/api/project/proj_2025_09_19_001

# Запустить ноду (пример с planner)
curl -X POST http://localhost:4321/api/node/n2_ai_planner/run \
  -H 'Content-Type: application/json' \
  -d '{"project_id":"proj_2025_09_19_001"}'

# Повторный запуск с клонированием
curl -X POST http://localhost:4321/api/node/n2_ai_planner/rerun \
  -H 'Content-Type: application/json' \
  -d '{"project_id":"proj_2025_09_19_001","clone":true}'

# Логи ноды
curl http://localhost:4321/api/node/n2_ai_planner/logs?project_id=proj_2025_09_19_001

# Валидация данных по схеме
curl -X POST http://localhost:4321/api/validate \
  -H 'Content-Type: application/json' \
  -d '{"schema_ref":"ACTOR_SCHEMA","data":{"name":"Аня","age_range":"18-25","traits":["энергичная","креативная","весёлая"],"bio":"","visual_prompt":"","voice_prompt":""}}'

# Экспорт в .lcfz
curl -OJ http://localhost:4321/api/project/proj_2025_09_19_001/export
```

## Демо и превиз
- Проект: `projects/proj_2025_09_19_001/project.flow.json`
- Заглушка видео: `projects/proj_2025_09_19_001/project_output/previz.mp4`

## План разработки
1. **FlowNodeCard 2.0.** Новая шапка с навигацией и настройками, чипы входов, режим предпросмотра Markdown, без нижнего футера.
2. **Graph/Workspace UX.** Проброс контекста, кнопки «назад/вперёд/сохранить/загрузить», обновление сайдбара.
3. **Стили Markdown.** Улучшенный вывод контента, ссылки, шрифты, блоки справки.
4. **Нода папки.** Просмотр накопленных артефактов, drag&drop и повторная генерация.
5. **HTML-нода.** Режим URL/HTML, настройка ширины, кнопка «Обновить» и пресеты.
6. **Автовыходы у ИИ.** Автоматическое создание/заполнение выходных нод и плейсхолдеров.
7. **Интеграции и ключи.** Добавление провайдеров, API-ключей, лимитов и привязка к настройкам AI.
8. **Финальное выравнивание.** Пройтись по UX, обновить документацию и прогнать сборку/тесты.

## Безопасность Python-песочницы
- Запуск в `.venv` внутри репозитория (создаётся автоматически)
- Разрешённые модули: `sys`, `json`, `re`, `csv`, `itertools`, `math`, `statistics`, `pandas`, `numpy`, `beautifulsoup4`, `lxml`, `markdown`
- Ввод передаётся через `stdin`, вывод должен быть JSON
- Таймаут 30 секунд, ограничение памяти 1 ГБ (переменная `LCF_RAM_LIMIT`)
- Запись разрешена только в `projects/<id>/project_output`
- Сеть выключена по умолчанию, при `allow_network: true` включается прокси-логгер (заглушка)

## Лицензия
MIT

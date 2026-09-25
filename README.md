# DotaArt — Dota 2 Hero Grid Art Tool

Веб-утилита для создания ASCII/символьной графики в сетке героев Dota 2.

## Возможности

-  **Конвертер изображений** — Canny edge detection (тонкие контуры), режимы яркости и точек
-  **Ручное рисование** — карандаш, ластик, линия, прямоугольник, окружность, заливка
-  **Выделение и перемещение** ячеек мышкой
-  **Живое превью** — оранжевый оверлей перед применением; перетаскивание мышью
-  **Мульти-символьный режим** — разные символы по яркости пикселя
-  **Экспорт** в `hero_grid_config.json` для замены в файлах игры

## Использование

1. Открой `index.html` в браузере
2. Загрузи изображение или нарисуй фигуру
3. Настрой шаг сетки, символы, позицию
4. Экспортируй JSON
5. Замени файл в Dota 2: `Steam/userdata/<id>/570/remote/cfg/hero_grid_config.json`

## Структура

```
DotaArt/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          # Главный контроллер
│   ├── grid.js         # Модель сетки (слои, координаты)
│   ├── canvas.js       # Рендер холста
│   ├── tools.js        # Инструменты рисования + выделение
│   ├── imageProcessor.js  # Canny edge detector (hi-res)
│   ├── textRenderer.js # Пиксельный шрифт
│   ├── shapes.js       # Пресеты фигур
│   ├── export.js       # Экспорт в Dota 2 JSON
│   └── undo.js         # История отмены
└── Ref/
    └── hero_grid_config.json  # Референсный JSON
```

Поддержать USDT:

UQAROrivxBAvKg_LuV8YjM_--UA5JGyb1A8Tk9GVwkT7Ivsj - TON

TBT2kt6RjaiQ2VyUHd5vB5N73WfC2ugYrf - Tron

0x8Af1D92936a04d26403FA809677a4CcDbfbea86a - ETH

D67FaB3x5HfANQbt1X6eWjpD9FiDD4KU5K76WjKB8YMM - SOL

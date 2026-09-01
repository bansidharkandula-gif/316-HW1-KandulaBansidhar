# Wolfie Lists — CSE 316 Homework 1

A to-do list application named after the Stony Brook mascot. A single page, no
frameworks, no build step: the browser loads the same ES modules you edit.

You are given a partly built application. Your job is to finish it.

---

## Running it

```
npm install       # only for the tests, never for the application
npm start         # then open http://localhost:9000
npm test          # the unit and integration tests
npm run test:e2e  # the end-to-end tests, in a real Chrome
```

The application runs on a fresh checkout. The home screen works — your lists are
there, you can open one and you can delete one — but an opened list looks empty
however many items it holds. Two methods are present but empty, and filling them
in is where you start.

---

## The tests are the specification

The whole test suite ships with this project, and it describes the finished
application precisely: every class name, every method signature, every event name
and every `id` and `data-action` attribute your markup needs.

```
npm test
```

On a fresh checkout most of it fails. **Making it pass is the assignment.** When
`npm test` and `npm run test:e2e` are both green, you are done.

Work the tasks in the order below rather than working the failure list top to
bottom. The early ones unblock whole files at once: filling in the two classes in
tasks 1 and 2 turns roughly two hundred tests green on its own.

---

## What you have to build

### 1. `ListItemIterator` — `js/model/ListItemIterator.js`

`hasNext()` always answers false, so an open list renders as empty however many
items it holds. `ListView` walks a list with this, and `WolfieList.createIterator()`
hands one out.

`WolfieListIterator`, beside it, is the finished version of the same idea for the
collection of lists. Read it first. Yours follows the same shape: hold the list
and a cursor in private fields, and implement `hasNext()`, `next()` and
`reset()`. Tests: `tests/unit/iterators.test.js`.

### 2. `ItemCardPrototype.initializeClone` — `js/view/prototypes/ItemCardPrototype.js`

Once task 1 is done a card appears for every item, but each one is drawn blank.
The `<template>` in `index.html` is the *shape* of a card and carries no text at
all; everything a user reads on a card arrives through `initializeClone()`.

It also stamps the item's index onto the element, which is what the buttons on a
card and the drag and drop code work from — so until this is written, neither
does anything.

`ListCardPrototype`, beside it, is the finished version of the same idea for the
cards on the home screen. Read it first. Tests: `tests/unit/prototypes.test.js`.

With 1 and 2 written the list screen comes alive: items appear, duplicating one
works, and so does dragging one to reorder it.

### 3. The missing fields on a `ListItem`

`ListItem` currently holds a description and a date entered. Add three more:
`priority`, `targetDate` and `completed`. Each one means touching the private
field, the constructor, a getter, `applyValues()` and `getValues()` — and
`toJSON()`, or your saved lists will quietly lose the new fields on the next
reload.

A priority is one of exactly three values — High, Medium and Low, in that order
wherever the user is offered the choice — and anything else, or nothing at all,
means Low. **How you arrange that vocabulary is up to you.** No test requires a
particular file, class or shape for it; what the tests do require is the three
values, their order in the modal's drop down, and Low as the default. `DateUtil`
is worth reading as one way of going about it — constants, a `values()` and a
`clean()` that turns anything unrecognized into a sensible default — but you are
not obliged to follow it. What you should avoid is the string "High" scattered
through a dozen files.

The way a priority *looks* is yours as well. Unlike the target date and the
completed tick, which have empty rules waiting for you in `wolfie_lists.css`, the
priority has nothing at all — no rule, no selector and no color. Work it out from
the screenshots in the assignment write up, and add the colors you need to the
palette in `:root` like every other color in the file.

Three other places move with them. `WolfieList` needs a `countCompleted()`, and
`ListCardPrototype` should then show *"1 of 3 completed"* rather than the plain
item count it shows today. And `EditItem_Transaction.valuesAreEqual` has to
compare the new fields, or an edit that only changes a priority will not reach the
undo stack.

### 4. The item modal

The modal opens on an existing item and carries Description, Date Entered, Next,
Cancel and OK. Add:

- **a Previous button**, the mirror of Next. The markup, the handler and the
  controller's response to `then === 'previous'` are all missing.
- **a Priority section and a Target Date / Completed section**, matching the
  fields you added in task 3. The target date sits on the left with the Completed
  checkbox beside it, and the two are independent: a target date says when an item
  is meant to be finished, the checkbox says whether it is.

### 5. Deleting an item

Nothing for this exists. An item card has no delete button, `EventTypes` has no
`DELETE_ITEM_REQUESTED`, and there is no `DeleteItem_Transaction`. Deleting an
item is guarded by the warning modal and **is** undoable.

`AppController` already deletes a whole *list* through the same warning modal —
follow that path. `DuplicateItem_Transaction` is the closest example of a
transaction that removes an item on undo.

### 6. Adding an item

Also missing entirely: the **+** button, `ADD_ITEM_REQUESTED`,
`AddItem_Transaction`, and the modal's create mode. Extend the existing
`ItemModal` rather than writing a second modal — it needs to know which of the two
jobs it is doing, so that the heading reads *New Item*, the OK button reads *Add*,
and Previous and Next are switched off for an item that does not exist yet.

### 7. Duplicating a list

The home screen has a delete button on each card but no duplicate button. Add the
button, the event, and the model method behind it. A copy is filed directly
beneath its original and given a name that is not already taken. Note that
duplicating a list is **not** undoable, by design — see the note below.

---

## What you have been given, and should not need to rewrite

| Provided | |
|---|---|
| `common/` | `Subject`, `Observer`, `UIEvent`, `EventTypes`, `Iterator`, `IdGenerator`, `DateUtil` |
| `model/` | `WolfieList`, `WolfieListIterator`, `WolfieListsModel` |
| `data/` | `DataStorageManager` — local storage and the example lists, one singleton |
| `view/` | `HomeView`, `ListView`, all four modals, `CardPrototype`, `ListCardPrototype` |
| `controller/` | `AppController` |
| `transactions/` | rename a list, edit an item, duplicate an item, move an item |
| `lib/jsTPS.js` | the undo/redo library. A library you use, not code you write |
| `index.html`, `wolfie_lists.css` | the markup and the whole look, minus the pieces belonging to the tasks above |

Working already: the whole home screen — its iterator, its cards, opening a list
and deleting a list — plus renaming a list with undo and redo, duplicating an
item, dragging an item to reorder it, saving to local storage, and the example
lists a brand new browser is given. The last three of those only become visible
once tasks 1 and 2 put item cards on the screen.

---

## How the code is arranged

```
public/
  index.html                  both screens and all three modals, and nothing else
  css/wolfie_lists.css        the whole look. all sizes in rem, SBU palette
  data/starter_lists.json     the example lists given to a new browser
  lib/jsTPS.js                the jsTPS transaction library, as an ES module
  js/
    main.js                   builds the objects, wires them together, starts
    common/                   the shared vocabulary. depends on nothing
    model/                    what the application knows
    data/                     where lists come from and go
    view/                     what the user sees
    controller/               what happens when the user does something
    transactions/             one class per undoable edit
tests/                        the three test tiers and both runner configs
server/server.js              zero-dependency static Web server, port 9000
```

**Four rules the design depends on.** Breaking one of them will make several
tests fail in ways that look unrelated to what you changed:

1. **The model never imports from `view/` or `controller/`.** It does not know a
   screen exists.
2. **A view reports, it does not decide.** Views announce what the user did as
   events; `AppController` is the only class that acts on them, and the only one
   that builds transactions.
3. **No markup lives in a `.js` file.** Every element is a `<template>` in
   `index.html`, cloned by the code that needs it. `tests/unit/no-html-in-javascript.test.js`
   enforces this.
4. **Every edit made inside a list goes through jsTPS**, so it can be undone.
   Creating, duplicating and deleting a whole *list* is deliberately not undoable:
   the transaction stack is cleared whenever a list is opened or closed.

---

## Testing

Three kinds, sorted by how much of the application each one involves.

| Kind | Where | Scope |
|---|---|---|
| Unit | `tests/unit/` | one class, alone |
| Integration | `tests/integration/` | several classes wired together |
| End-to-end | `tests/e2e/` | the whole stack, in a real Chrome |

```
npm test               # unit + integration
npm run test:watch     # the same, re-running as you save
npm run test:coverage  # plus a coverage report in tests/output/coverage/
npm run test:e2e       # end-to-end
npm run test:all       # everything
```

The end-to-end tests drive the Google Chrome already installed on your machine
rather than downloading their own copy. If Playwright complains that it cannot
find a browser, run `npx playwright install chromium` and delete the
`channel: 'chrome'` line in `tests/playwright.config.js`.

Two things in `tests/helpers/app.js` are worth reading before you write any test
of your own — `vi.resetModules()` and the document-handler cleanup. Both are
commented at length, and both exist to solve problems that will otherwise cost you
an afternoon.

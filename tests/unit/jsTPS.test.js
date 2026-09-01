/**
 * jsTPS.test.js
 *
 * Tests the transaction processing system on its own, with no model, no DOM and
 * no application anywhere in sight.
 *
 * The transactions used here do nothing but append a letter to a log. That is
 * deliberate: it lets us check the order and the number of times things happen,
 * which is the entire behavior of an undo stack, without any of it being tangled
 * up in what a Wolfie List happens to be.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { jsTPS, jsTPS_Transaction } from '../../public/lib/jsTPS.js';

/**
 * A transaction that writes down when it is done and when it is undone.
 */
class LoggingTransaction extends jsTPS_Transaction {
    constructor(name, log) {
        super();
        this.name = name;
        this.log = log;
    }

    doTransaction() {
        this.log.push(`do:${this.name}`);
    }

    undoTransaction() {
        this.log.push(`undo:${this.name}`);
    }

    toString() {
        return `LoggingTransaction(${this.name})`;
    }
}

describe('jsTPS_Transaction', () => {
    // JavaScript has no abstract keyword. The base class enforces the contract by
    // throwing, and these two tests are what make sure it really does, because a
    // subclass that forgot to override would otherwise fail silently.
    it('refuses to be used without doTransaction being overridden', () => {
        class Incomplete extends jsTPS_Transaction {}
        expect(() => new Incomplete().doTransaction()).toThrow(/must override doTransaction/);
    });

    it('names the offending subclass in the error, not the base class', () => {
        class ForgotToOverride extends jsTPS_Transaction {}
        expect(() => new ForgotToOverride().undoTransaction())
            .toThrow(/ForgotToOverride must override undoTransaction/);
    });
});

describe('jsTPS', () => {
    let tps;
    let log;

    beforeEach(() => {
        tps = new jsTPS();
        log = [];
    });

    const transaction = (name) => new LoggingTransaction(name, log);

    describe('a brand new stack', () => {
        it('has nothing to undo and nothing to redo', () => {
            expect(tps.hasTransactionToUndo()).toBe(false);
            expect(tps.hasTransactionToRedo()).toBe(false);
            expect(tps.getSize()).toBe(0);
            expect(tps.getUndoSize()).toBe(0);
            expect(tps.getRedoSize()).toBe(0);
        });

        it('ignores an undo, rather than throwing', () => {
            expect(() => tps.undoTransaction()).not.toThrow();
            expect(log).toEqual([]);
        });

        it('ignores a redo, rather than throwing', () => {
            expect(() => tps.doTransaction()).not.toThrow();
            expect(log).toEqual([]);
        });
    });

    describe('adding', () => {
        it('performs a transaction the moment it is added', () => {
            tps.addTransaction(transaction('A'));
            expect(log).toEqual(['do:A']);
        });

        it('leaves the new transaction as the one that would be undone next', () => {
            tps.addTransaction(transaction('A'));
            expect(tps.hasTransactionToUndo()).toBe(true);
            expect(tps.hasTransactionToRedo()).toBe(false);
            expect(tps.getUndoSize()).toBe(1);
        });
    });

    describe('undo and redo', () => {
        beforeEach(() => {
            tps.addTransaction(transaction('A'));
            tps.addTransaction(transaction('B'));
            tps.addTransaction(transaction('C'));
            log.length = 0;
        });

        it('undoes in the reverse of the order things were done', () => {
            tps.undoTransaction();
            tps.undoTransaction();
            tps.undoTransaction();
            expect(log).toEqual(['undo:C', 'undo:B', 'undo:A']);
        });

        it('redoes in the original order', () => {
            tps.undoTransaction();
            tps.undoTransaction();
            log.length = 0;

            tps.doTransaction();
            tps.doTransaction();
            expect(log).toEqual(['do:B', 'do:C']);
        });

        it('survives being driven all the way down and all the way back up twice', () => {
            for (let round = 0; round < 2; round++) {
                while (tps.hasTransactionToUndo()) tps.undoTransaction();
                while (tps.hasTransactionToRedo()) tps.doTransaction();
            }
            expect(tps.getSize()).toBe(3);
            expect(tps.getUndoSize()).toBe(3);
            expect(tps.getRedoSize()).toBe(0);
        });

        it('stops at the bottom instead of running off the end', () => {
            tps.undoTransaction();
            tps.undoTransaction();
            tps.undoTransaction();
            log.length = 0;

            tps.undoTransaction();
            tps.undoTransaction();
            expect(log).toEqual([]);
            expect(tps.hasTransactionToUndo()).toBe(false);
        });

        it('stops at the top instead of running off the end', () => {
            log.length = 0;
            tps.doTransaction();
            tps.doTransaction();
            expect(log).toEqual([]);
            expect(tps.hasTransactionToRedo()).toBe(false);
        });

        it('reports the sizes of the two halves of the stack', () => {
            expect(tps.getUndoSize()).toBe(3);
            expect(tps.getRedoSize()).toBe(0);

            tps.undoTransaction();
            expect(tps.getUndoSize()).toBe(2);
            expect(tps.getRedoSize()).toBe(1);
            // the transaction is still on the stack, it has simply been undone
            expect(tps.getSize()).toBe(3);
        });
    });

    describe('branching, i.e. doing something new after an undo', () => {
        // This is the behavior every editor has and almost nobody thinks about
        // until it is missing. Undo twice, then type something: the two things
        // you undid are gone for good, they cannot be redone any more.
        it('throws away everything above the cursor', () => {
            tps.addTransaction(transaction('A'));
            tps.addTransaction(transaction('B'));
            tps.addTransaction(transaction('C'));
            tps.undoTransaction();
            tps.undoTransaction();
            log.length = 0;

            tps.addTransaction(transaction('D'));

            expect(log).toEqual(['do:D']);
            expect(tps.getSize()).toBe(2);
            expect(tps.hasTransactionToRedo()).toBe(false);
        });

        it('leaves the surviving transactions still undoable in order', () => {
            tps.addTransaction(transaction('A'));
            tps.addTransaction(transaction('B'));
            tps.undoTransaction();
            tps.addTransaction(transaction('C'));
            log.length = 0;

            tps.undoTransaction();
            tps.undoTransaction();

            // B was discarded when C arrived, so C undoes onto A, never onto B
            expect(log).toEqual(['undo:C', 'undo:A']);
        });

        it('discards a fully undone stack before adding', () => {
            tps.addTransaction(transaction('A'));
            tps.undoTransaction();
            tps.addTransaction(transaction('B'));

            expect(tps.getSize()).toBe(1);
            expect(tps.hasTransactionToRedo()).toBe(false);
        });
    });

    describe('clearAllTransactions', () => {
        // The model calls this every time a list is opened or closed. Undo must
        // never reach back across a list boundary and start undoing edits made
        // to a completely different list.
        it('empties the stack without undoing anything', () => {
            tps.addTransaction(transaction('A'));
            tps.addTransaction(transaction('B'));
            log.length = 0;

            tps.clearAllTransactions();

            expect(log).toEqual([]);
            expect(tps.getSize()).toBe(0);
            expect(tps.hasTransactionToUndo()).toBe(false);
            expect(tps.hasTransactionToRedo()).toBe(false);
        });
    });

    describe('the performing flags', () => {
        it('reports isPerformingDo only while a transaction is being done', () => {
            let seenDuringDo = null;
            const spy = new (class extends jsTPS_Transaction {
                doTransaction() { seenDuringDo = tps.isPerformingDo(); }
                undoTransaction() {}
            })();

            expect(tps.isPerformingDo()).toBe(false);
            tps.addTransaction(spy);
            expect(seenDuringDo).toBe(true);
            expect(tps.isPerformingDo()).toBe(false);
        });

        it('reports isPerformingUndo only while a transaction is being undone', () => {
            let seenDuringUndo = null;
            const spy = new (class extends jsTPS_Transaction {
                doTransaction() {}
                undoTransaction() { seenDuringUndo = tps.isPerformingUndo(); }
            })();

            tps.addTransaction(spy);
            expect(tps.isPerformingUndo()).toBe(false);
            tps.undoTransaction();
            expect(seenDuringUndo).toBe(true);
            expect(tps.isPerformingUndo()).toBe(false);
        });
    });

    describe('toString', () => {
        it('lists every transaction and marks where the cursor is', () => {
            tps.addTransaction(transaction('A'));
            tps.addTransaction(transaction('B'));
            tps.undoTransaction();

            const text = tps.toString();
            expect(text).toContain('2 transactions');
            expect(text).toContain('LoggingTransaction(A)');
            expect(text).toContain('LoggingTransaction(B)');
            // A is the most recently done one now, so the marker belongs on A
            expect(text).toMatch(/0: LoggingTransaction\(A\) <-- most recent/);
            expect(text).not.toMatch(/LoggingTransaction\(B\) <-- most recent/);
        });
    });
});

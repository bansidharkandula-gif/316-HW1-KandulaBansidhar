/**
 * jsTPS.js
 *
 * jsTPS is a JavaScript Transaction Processing System. It is a general purpose
 * library for providing undo/redo to any application. This is the publicly
 * available jsTPS library, vendored here as an ES module so that the browser can
 * import it directly with no bundler and no npm install.
 *
 * HOW IT WORKS
 * ------------
 * Every change the user makes to a list is wrapped up inside an object that knows
 * two things: how to do that change, and how to undo it. That object is a
 * transaction. Transactions get pushed onto a stack. Undo walks backwards down
 * the stack, redo walks forwards back up it. If the user does something new while
 * partway down the stack, everything above the current position is thrown away,
 * exactly like the undo behavior of any editor you have ever used.
 *
 * The only rule you must follow: a transaction's undoTransaction must perfectly
 * reverse its doTransaction, and doTransaction must be safe to call any number of
 * times with the same result. That is why our transactions remember the data they
 * removed rather than recomputing it.
 */

/**
 * jsTPS_Transaction
 *
 * The abstract base class for every transaction. Subclasses must override both
 * methods. JavaScript has no abstract keyword, so we enforce it by throwing.
 */
export class jsTPS_Transaction {
    /**
     * Performs the work of this transaction. Called by the jsTPS when the
     * transaction is first added and again on every redo.
     */
    doTransaction() {
        throw new Error(`${this.constructor.name} must override doTransaction()`);
    }

    /**
     * Perfectly reverses whatever doTransaction did.
     */
    undoTransaction() {
        throw new Error(`${this.constructor.name} must override undoTransaction()`);
    }
}

/**
 * jsTPS
 *
 * The transaction processing system itself, i.e. the stack of transactions plus
 * the cursor telling us where in that stack we currently are.
 */
export class jsTPS {
    constructor() {
        // the stack of transactions, oldest first
        this.transactions = [];

        // index of the transaction that was most recently done. -1 means
        // everything has been undone, or nothing has happened yet
        this.mostRecentTransaction = -1;

        // these let a transaction ask whether it is being done or undone right now
        this.performingDo = false;
        this.performingUndo = false;
    }

    isPerformingDo() {
        return this.performingDo;
    }

    isPerformingUndo() {
        return this.performingUndo;
    }

    /**
     * Adds a transaction to the stack and immediately does it. Anything that had
     * been undone is discarded first, since the timeline just branched.
     *
     * @param {jsTPS_Transaction} transaction the transaction to add and perform
     */
    addTransaction(transaction) {
        if (this.mostRecentTransaction < 0
            || this.mostRecentTransaction < this.transactions.length - 1) {
            this.transactions.splice(this.mostRecentTransaction + 1);
        }
        this.transactions.push(transaction);
        this.doTransaction();
    }

    /**
     * Does the next transaction on the stack, if there is one. This is redo.
     */
    doTransaction() {
        if (this.hasTransactionToRedo()) {
            this.performingDo = true;
            const transaction = this.transactions[this.mostRecentTransaction + 1];
            transaction.doTransaction();
            this.mostRecentTransaction++;
            this.performingDo = false;
        }
    }

    /**
     * Undoes the most recently done transaction, if there is one.
     */
    undoTransaction() {
        if (this.hasTransactionToUndo()) {
            this.performingUndo = true;
            const transaction = this.transactions[this.mostRecentTransaction];
            transaction.undoTransaction();
            this.mostRecentTransaction--;
            this.performingUndo = false;
        }
    }

    /**
     * Throws the entire transaction history away. We call this whenever we open
     * or close a list, since undo must never cross a list boundary.
     */
    clearAllTransactions() {
        this.transactions = [];
        this.mostRecentTransaction = -1;
    }

    hasTransactionToRedo() {
        return this.mostRecentTransaction + 1 < this.transactions.length;
    }

    hasTransactionToUndo() {
        return this.mostRecentTransaction >= 0;
    }

    getSize() {
        return this.transactions.length;
    }

    getUndoSize() {
        return this.mostRecentTransaction + 1;
    }

    getRedoSize() {
        return this.transactions.length - (this.mostRecentTransaction + 1);
    }

    /**
     * Useful when debugging, it prints the whole stack with a marker showing where
     * the cursor currently sits.
     */
    toString() {
        let text = `--jsTPS (${this.getSize()} transactions)--\n`;
        for (let i = 0; i < this.transactions.length; i++) {
            const cursor = (i === this.mostRecentTransaction) ? ' <-- most recent' : '';
            text += `  ${i}: ${this.transactions[i].toString()}${cursor}\n`;
        }
        return text;
    }
}

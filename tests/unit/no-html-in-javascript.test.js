/**
 * no-html-in-javascript.test.js
 *
 * One rule, enforced: **no markup is written in JavaScript.** Every element in
 * this application comes from a <template> in index.html, fetched by the class
 * that needs it and copied with cloneNode.
 *
 * This is an unusual test, because it reads the source files rather than running
 * them. That is on purpose. The rule is about how the code is WRITTEN, not about
 * what it does, and a rule of that kind cannot be checked by exercising the
 * application: a card built from a hard coded string renders exactly as well as
 * a card cloned from a template, so every other test in this suite would pass
 * either way.
 *
 * It is the same idea as the architectural rules in .dependency-cruiser.cjs. A
 * convention nothing checks is a convention that lasts until the first person in
 * a hurry.
 *
 * WHY THE RULE
 * ------------
 * Markup living in a .js file cannot be found by anyone searching index.html for
 * a class name they can see in the inspector, is never seen by an HTML
 * validator, gets no highlighting or tag matching from the editor, and drifts
 * away from the stylesheet the moment somebody edits one and not the other.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const APPLICATION_ROOT = path.resolve(process.cwd(), 'public/js');

/** @return {string[]} every .js file under public/js, recursively */
function everySourceFile(directory = APPLICATION_ROOT, found = []) {
    for (const entry of readdirSync(directory)) {
        const full = path.join(directory, entry);
        if (statSync(full).isDirectory()) everySourceFile(full, found);
        else if (entry.endsWith('.js')) found.push(full);
    }
    return found;
}

/**
 * Strips comments before searching, so that a file explaining the rule is not
 * caught by it. This is why the comment block in CardPrototype.js can talk about
 * innerHTML without failing its own test.
 *
 * @param {string} source
 * @return {string} the code, with block and line comments blanked out
 */
function withoutComments(source) {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
}

const sourceFiles = everySourceFile().map((file) => ({
    name: path.relative(process.cwd(), file).replace(/\\/g, '/'),
    code: withoutComments(readFileSync(file, 'utf8'))
}));

describe('the source files themselves', () => {
    it('finds the application to check', () => {
        // if a refactor moved public/js, this test would otherwise pass by
        // checking nothing at all, which is the worst way for a guard to fail
        expect(sourceFiles.length).toBeGreaterThan(20);
        expect(sourceFiles.map((f) => f.name)).toContain('public/js/main.js');
    });
});

describe('no markup is written in JavaScript', () => {
    it.each([
        ['innerHTML', /\.innerHTML\s*=/],
        ['outerHTML', /\.outerHTML\s*=/],
        ['insertAdjacentHTML', /insertAdjacentHTML\s*\(/],
        ['document.write', /document\s*\.\s*write\s*\(/]
    ])('never assigns markup with %s', (_label, pattern) => {
        const offenders = sourceFiles
            .filter((file) => pattern.test(file.code))
            .map((file) => file.name);

        expect(offenders, `use a <template> in index.html instead`).toEqual([]);
    });

    it('never builds an element with document.createElement', () => {
        // Not because createElement is dangerous, but because reaching for it is
        // how markup starts creeping back into the JavaScript one tag at a time.
        // Everything this application builds has a shape, and a shape belongs in
        // the HTML file.
        const offenders = sourceFiles
            .filter((file) => /document\s*\.\s*createElement\s*\(/.test(file.code))
            .map((file) => file.name);

        expect(offenders, 'clone a <template> from index.html instead').toEqual([]);
    });

    it('contains no string literal that is actually markup', () => {
        // Catches the obvious smuggling route: building a card as a string and
        // handing it to something that parses it.
        //
        // The tricky part of a check like this is telling markup apart from
        // PROSE ABOUT markup: a message reading "... is a <div>, not a
        // <template>" is a sentence, not a card. Merely opening a tag is
        // therefore not enough evidence; a string only counts as markup if it
        // also closes a tag or assigns an attribute, which sentences about tags
        // do not do.
        const OPENS_A_TAG =
            /<\s*(div|span|li|ul|ol|button|option|section|header|p|a|img|input|template)\b/i;
        const CLOSES_A_TAG_OR_SETS_AN_ATTRIBUTE = /<\/\s*[a-z]|=\s*["']/i;

        const offenders = [];
        for (const file of sourceFiles) {
            const literals = file.code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [];
            const markup = literals.filter((literal) =>
                OPENS_A_TAG.test(literal) && CLOSES_A_TAG_OR_SETS_AN_ATTRIBUTE.test(literal));
            if (markup.length > 0) {
                offenders.push(`${file.name}: ${markup[0].slice(0, 60)}`);
            }
        }

        expect(offenders, 'put this markup in a <template> in index.html').toEqual([]);
    });
});

describe('every template the application asks for exists in index.html', () => {
    // The other half of the bargain. Moving the markup into index.html only
    // helps if the two stay in step, and a mistyped id is a run time failure
    // that appears the first time a card is drawn rather than at startup.
    const indexHtml = readFileSync(
        path.resolve(process.cwd(), 'public/index.html'), 'utf8');

    /** every template id the application declares */
    const requestedIds = [...new Set(
        sourceFiles.flatMap((file) =>
            [...file.code.matchAll(/TEMPLATE_ID\s*=\s*'([^']+)'/g)].map((m) => m[1]))
    )];

    it('finds the ids the source asks for', () => {
        expect(requestedIds.length).toBeGreaterThanOrEqual(3);
    });

    it.each(requestedIds)('index.html defines a <template id="%s">', (id) => {
        expect(indexHtml).toMatch(
            new RegExp(`<template[^>]*\\bid=["']${id}["']`));
    });
});

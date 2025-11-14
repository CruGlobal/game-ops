#!/usr/bin/env node

/**
 * Remove DynamoDB production branches from contributorService.js
 * This script removes all `if (process.env.NODE_ENV === 'production')` blocks
 * and keeps only the else (Prisma) code.
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/services/contributorService.js');

console.log('Reading file...');
let content = fs.readFileSync(filePath, 'utf8');

// Count how many production checks we have
const matches = content.match(/if \(process\.env\.NODE_ENV === 'production'\) \{/g);
console.log(`Found ${matches ? matches.length : 0} DynamoDB branches to remove\n`);

// Simple regex approach - remove if blocks and keep else blocks
// This works because all production checks have an else block with Prisma code

let iterations = 0;
const maxIterations = 20; // Safety limit

while (content.includes("if (process.env.NODE_ENV === 'production') {") && iterations < maxIterations) {
    iterations++;
    
    // Find the if statement
    const ifIndex = content.indexOf("if (process.env.NODE_ENV === 'production') {");
    if (ifIndex === -1) break;
    
    // Find the matching else
    let braceCount = 0;
    let i = ifIndex + "if (process.env.NODE_ENV === 'production') {".length;
    let elseIndex = -1;
    
    // Scan forward to find the closing brace and else
    while (i < content.length) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') {
            braceCount--;
            if (braceCount === -1) {
                // Found the closing brace of the if block
                // Check if there's an else
                const afterIf = content.substring(i + 1).trimStart();
                if (afterIf.startsWith('else {')) {
                    elseIndex = i + 1 + content.substring(i + 1).indexOf('else {');
                    break;
                }
            }
        }
        i++;
    }
    
    if (elseIndex === -1) {
        console.error(`Could not find else block for if at position ${ifIndex}`);
        break;
    }
    
    // Find the end of the else block
    i = elseIndex + 'else {'.length;
    braceCount = 1;
    let elseEndIndex = -1;
    
    while (i < content.length && braceCount > 0) {
        if (content[i] === '{') braceCount++;
        if (content[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                elseEndIndex = i;
                break;
            }
        }
        i++;
    }
    
    if (elseEndIndex === -1) {
        console.error(`Could not find end of else block`);
        break;
    }
    
    // Extract the else block content (without the else { and })
    const elseContent = content.substring(elseIndex + 'else {'.length, elseEndIndex);
    
    // Find the start of the if statement (including any indentation)
    let ifStart = ifIndex;
    while (ifStart > 0 && content[ifStart - 1] !== '\n') {
        ifStart--;
    }
    
    // Replace the entire if-else with just the else content
    const before = content.substring(0, ifStart);
    const after = content.substring(elseEndIndex + 1);
    
    content = before + elseContent + after;
    
    console.log(`Removed DynamoDB branch ${iterations}`);
}

console.log(`\n✅ Removed ${iterations} DynamoDB branches`);

// Check if any remain
const remaining = content.match(/if \(process\.env\.NODE_ENV === 'production'\) \{/g);
if (remaining) {
    console.log(`⚠️  Warning: ${remaining.length} branches still remain (may need manual cleanup)`);
} else {
    console.log(`✅ All DynamoDB branches removed!`);
}

// Write the file
fs.writeFileSync(filePath, content, 'utf8');
console.log(`\n✅ File updated: ${filePath}`);

console.log('\n📋 Next steps:');
console.log('   1. Run: cd app && npm test');
console.log('   2. If tests pass, commit the changes');
console.log('   3. If tests fail, restore from backup/contributorService-before-dynamodb-cleanup.js');

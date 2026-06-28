/**
 * colorize.cjs — Cobalt2-inspired colorful CLI output
 * Zero dependencies.
 * 
 * Palet terinspirasi dari Cobalt2 Theme (Wes Bos):
 *   Yellow/Gold → Highlight, Header     (signature Cobalt2)
 *   Green       → Success
 *   Red         → Error
 *   Blue        → Path, Info
 *   Cyan        → Secondary info
 *   Gray        → Dim, dividers
 */
"use strict";

const isColorSupported = !process.env.NO_COLOR && process.stdout.isTTY;

const RESET      = '\x1b[0m';
const BOLD       = '\x1b[1m';
const DIM        = '\x1b[2m';
const UNDERLINE  = '\x1b[4m';

// Bright ANSI colors — Cobalt2 style (vibrant & bold)
const FG = {
  green:  '\x1b[92m',   // ≈ #3CE03D
  red:    '\x1b[91m',   // ≈ #FF2600
  yellow: '\x1b[93m',   // ≈ #F1D000 ← iconic Cobalt2 gold
  blue:   '\x1b[94m',   // ≈ #6871FF
  cyan:   '\x1b[96m',   // ≈ #79E8FF
  gray:   '\x1b[90m',   // ≈ #686868
};

function color(code, text) {
  if (!isColorSupported) return text;
  return `${code}${text}${RESET}`;
}

function bold(text)     { return color(BOLD, text); }
function dim(text)      { return color(DIM, text); }
function underline(text){ return color(UNDERLINE, text); }

function green(text)    { return color(FG.green, text); }
function red(text)      { return color(FG.red, text); }
function yellow(text)   { return color(FG.yellow, text); }
function blue(text)     { return color(FG.blue, text); }
function cyan(text)     { return color(FG.cyan, text); }
function gray(text)     { return color(FG.gray, text); }

// ========== High-level styled output ==========

/**
 * ✔ Selesai
 * Bright green — Cobalt2 style
 */
function success(text) {
  return `${green('✔')} ${BOLD}${FG.green}${text}${RESET}`;
}

/**
 * ✘ Gagal
 * Bright red — bold & clear
 */
function error(text) {
  return `${red('✘')} ${BOLD}${FG.red}${text}${RESET}`;
}

/**
 * ⚠ Warning
 * Bright yellow — Cobalt2 signature
 */
function warn(text) {
  return `${yellow('⚠')} ${BOLD}${FG.yellow}${text}${RESET}`;
}

/**
 * ℹ Info — blue
 */
function info(text) {
  return `${BOLD}${FG.blue}ℹ${RESET} ${blue(text)}`;
}

/**
 * Highlight — YELLOW bold (Cobalt2 signature!)
 * The iconic gold color for emphasis
 */
function highlight(text) {
  return `${BOLD}${FG.yellow}${text}${RESET}`;
}

/**
 * File path — blue underline
 */
function path(text) {
  return `${UNDERLINE}${FG.blue}${text}${RESET}`;
}

/**
 * Divider — gray dim line
 */
function divider(char = '─', length = 40) {
  if (!isColorSupported) return char.repeat(length);
  return gray(dim(char.repeat(length)));
}

/**
 * Header — Cobalt2 gold + cyan accent
 * ─── Title ───
 */
function header(text) {
  if (!isColorSupported) return `─── ${text} ───`;
  const gold = `${BOLD}${FG.yellow}`;
  return `\n${gold}───${RESET} ${BOLD}${FG.yellow}${text}${RESET} ${gold}───${RESET}`;
}

// ========== Print helpers ==========

function printSuccess(m) { console.log(success(m)); }
function printError(m)   { console.error(error(m)); }
function printWarn(m)    { console.error(warn(m)); }
function printInfo(m)    { console.log(info(m)); }

module.exports = {
  // Low-level
  bold, dim, underline,
  // Colors
  cyan, blue, green, red, yellow, gray,
  // High-level
  success, error, warn, info, highlight, path, divider, header,
  // Print helpers
  printSuccess, printError, printWarn, printInfo,
};

# JUPAS Cal — Web Application Plan & Architecture

This document outlines the architecture and implementation roadmap for the JUPAS 2026 Web Application.

## 1. Goal
Transition from a legacy Excel-based calculator to a high-performance, maintainable, and transparent client-side web application hosted on GitHub Pages.

## 2. Architecture (Implemented)

### Core Components
- **`data/processed/JUPAS_2026_Unified_Data.json`**: The single source of truth. Contains structured calculation rules and requirements for 432 programmes.
- **`js/calculator.js`**: The pure-logic "Brain." Implements the bit-perfect port of the Python calculation engine.
- **`js/ui.js`**: The UI Controller. Manages DOM interactions, user inputs, search filtering, and result rendering.
- **`css/style.css`**: Modern, responsive layout with institution-specific themes and "Excel-style" calculation highlights.

### Pure Client-Side Implementation
- **No Backend:** All data is fetched as static JSON. All calculations occur in the user's browser.
- **State Management:** User inputs (grades) are collected via DOM selectors and passed to the calculation engine on every change.

## 3. Transparency & UI Features
- **Audit Trail:** Every calculation result includes a detailed breakdown table showing raw converted points, applied multipliers, and final weighted scores.
- **Green Highlights:** Selected subjects used in the "Best N" total are highlighted in green, mirroring the original Excel logic.
- **Eligibility Badges:** Real-time feedback on whether the student meets the 2026 minimum university and programme-specific requirements.

## 4. Future Enhancements
- [ ] **Local Storage:** Save the student's grades locally so they don't have to re-enter them on refresh.
- [ ] **Sorting & Ranking:** Add the ability to sort the entire programme list by the user's estimated score vs. historical Median/LQ.
- [ ] **Institution Filtering:** Add checkboxes to show programmes only from specific universities.
- [ ] **Bilingual Support:** Full integration of the `term_glossary.json` for seamless EN/ZH switching.

# Kaelyn's Academy

An interactive learning website designed for young children. Features colorful animations, engaging visualizations, and progressive learning modules for math, reading, and more.

## Features

- **Number Places**: Learn about thousands, hundreds, tens, and ones with visual blocks
- **Stacked Math**: Practice addition and subtraction with column/vertical format
- **Multiplication**: Interactive times tables with visual grid representation
- **Division**: Learn to divide with sharing scenarios and visual groups
- **Practice Area**: Customizable practice sessions with auto-generated problems

## Getting Started

### Prerequisites

- Bun (recommended) or Node.js 16.0.0+

### Installation

```bash
bun install
```

### Running the Application

```bash
bun start
# or for development with auto-reload:
bun run dev
```

Then open http://localhost:3000 in your browser.

## Learning Modules

### Number Places
- Interactive place value visualization
- Visual blocks for thousands, hundreds, tens, and ones
- Quiz mode to test understanding

### Stacked Addition & Subtraction
- Step-by-step column addition/subtraction
- Carrying and borrowing practice
- Hints and answer reveal options

### Multiplication
- Visual grid showing multiplication as groups
- Complete times tables (1-12)
- Interactive quiz with scoring

### Division
- Real-world sharing scenarios
- Visual representation of division
- Clean division problems (no remainders for beginners)

### Practice Area
- Choose operation type (or mixed)
- Select difficulty level
- Customize number of problems
- Track progress with stars and percentages

## Progress Tracking

Progress is automatically saved in session cookies:
- Total stars earned
- Practice session history (last 10 scores)
- Module-specific progress (questions attempted/correct)
- Lessons visited and completed
- Best scores and accuracy

Sessions persist for 30 days.

## Tech Stack

- Next.js 16 with App Router
- React 19 with TypeScript (strict mode)
- Redux Toolkit for state management
- Tailwind CSS v4 with CSS variable theming
- Bun runtime (Node.js compatible)
- Signed cookie sessions for persistence

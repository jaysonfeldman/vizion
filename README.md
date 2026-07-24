# AI Search Analytics Platform

A hackathon project for AI search visibility analysis. Measures and improves domain performance in AI-powered search results through automated query generation, citation analysis, and Gemini-powered competitive insights.

<img width="1410" height="855" alt="Screenshot 2026-07-24 at 06 18 07" src="https://github.com/user-attachments/assets/7cf034d3-1a9a-4fe2-aff2-6730a0a21cb4" />


## Architecture

**Backend (Python)**
- `extract.py`: Core AI search experiment runner using Gemini 2.5 Flash with Google Search grounding
- `analytics.py`: Search performance analytics engine with domain ranking analysis
- `api.py`: FastAPI REST API serving comprehensive search analytics reports

**Frontend (Next.js)**
- React-based dashboard for visualizing search analytics
- Multi-step analysis interface with real-time progress tracking
- Interactive charts and performance metrics display

## Core Features

**Search Generation & Analysis**
- Automated query generation and execution through Gemini models
- Citation extraction and ranking analysis from AI responses
- Domain performance metrics (retrieval rate, usage rate, citation positioning)

**Competitive Intelligence**
- Gemini-powered analysis of underperforming queries
- Content gap identification through AI competitor analysis
- Performance benchmarking against competing domains

**Analytics Dashboard**
- Domain-specific performance reports
- Query intersection analysis across multiple prompts
- AI-generated recommendations for content optimization

## Key Components

- **Search Execution**: Parallel query processing with Google Search grounding
- **Performance Metrics**: Citation rank tracking, domain visibility scoring
- **AI Analysis**: Gemini-powered insights for poor performance cases
- **API Layer**: RESTful endpoints for analytics data and recommendations
- **Frontend Interface**: Interactive dashboard for data visualization

## Technical Implementation

- Python with FastAPI for backend analytics processing
- Next.js with TypeScript for frontend dashboard
- Google Gemini API integration for AI-powered analysis
- Real-time progress tracking and responsive UI components

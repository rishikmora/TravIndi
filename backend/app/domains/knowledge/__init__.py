"""Knowledge domain — knowledge_sources, knowledge_documents, knowledge_chunks,
knowledge_versions, ai_sessions, ai_messages, ai_tool_calls, ai_responses,
ai_predictions, recommendations. Owns the `knowledge` DB schema.

This schema does not exist in either version of the source Database Design
document — added during Phase 5 reconciliation because neither version gives
the AI/RAG tables it describes in detail a schema home
(docs/00-planning/09-database-schema-plan.md §1).

P0 (AI travel planning is RAG-grounded). Implemented starting Phase 12.
"""

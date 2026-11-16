# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
ThinkSemi's internal purchasing, engineering, stores, quality and factory teams.

## Product Purpose
Upload and understand customer BoMs, source components internally first, assess manufacturing readiness, quote builds and coordinate factory work.

## Operating Context
A four-line EMS factory. Frequent use on office desktops and factory-floor tablets, with dense part identifiers, quantities, stock, pricing and risk data. Indian currency and Asia/Kolkata dates are the defaults.

## Capabilities and Constraints
Preserve all existing workflows, role permissions, backend behavior and route structure. The implementation uses Next.js 15, React, Tailwind, Prisma and PostgreSQL. Supplier mock data must remain visibly identified. Desktop, tablet, phone, light and dark modes must work.

## Brand Commitments
The user confirmed: “Keep workflows and branding; redesign all screens.” Preserve ThinkSemi's name and logo, EMS Sourcing product name, and recognizable blue brand identity.

## Evidence on Hand
Existing application, Prisma seed, BoM samples, Gerbers, stock records, structured component knowledge, unit and end-to-end tests. Derive dashboard facts from real database queries; do not fabricate statistics.

## Product Principles
- Put the next useful action beside the data that motivates it.
- Keep risk and readiness legible through both text and color.
- Use consistent controls and clear wayfinding across modules.
- Keep the full sourcing-to-factory workflow available to each authorized role.

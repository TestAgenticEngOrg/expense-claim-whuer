# Domain Model

The core entities behind expense claims: who reports to whom, the claims an
employee submits, and the single weekly limit each manager sets for their team.

```mermaid
erDiagram
    MANAGER ||--o{ EMPLOYEE : manages
    MANAGER ||--o| WEEKLY_LIMIT : sets
    EMPLOYEE ||--o{ EXPENSE_CLAIM : submits

    MANAGER {
        string id
        string name
        string email
    }
    EMPLOYEE {
        string id
        string name
        string email
        string managerId
    }
    EXPENSE_CLAIM {
        string id
        string employeeId
        decimal amount
        string currency
        string merchant
        date expenseDate
        string category
        string receiptImageUrl
        string status
        string managerComment
        datetime createdAt
    }
    WEEKLY_LIMIT {
        string id
        string managerId
        string naturalLanguageText
        decimal amountPerWeek
        string currency
        datetime updatedAt
    }
```

- **Employee** and **Manager** are both signed-in people; `Employee.managerId`
is what makes an employee part of a manager's team.
- **ExpenseClaim.status** is one of `pending`, `approved`, `rejected`.
- **WeeklyLimit** is one row per manager (their team's single limit): it keeps
both the manager's original `naturalLanguageText` and the
`amountPerWeek`/`currency` the limit-agent derived from it.


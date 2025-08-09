# Deploying Analytics Views to Supabase

## Option 1: Via Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/obrjirdnqoiailhbsnmu
   - Navigate to SQL Editor (left sidebar)

2. **Execute the Views SQL**
   - Click "New Query"
   - Copy the entire contents of `/supabase/views/analytics.sql`
   - Paste into the SQL editor
   - Click "Run" or press Cmd+Enter

3. **Verify Views Were Created**
   - In the left sidebar, go to "Database" → "Views"
   - You should see all 9 new views listed

## Option 2: Via Supabase CLI

```bash
# Make sure you're in the project root
cd /Users/junaid/Workspace/www/alfred

# Link to your project (if not already linked)
supabase link --project-ref obrjirdnqoiailhbsnmu

# Execute the SQL file
supabase db execute --file supabase/views/analytics.sql
```

## Option 3: Via psql (Direct Connection)

```bash
# Connect directly to the database
psql "postgresql://postgres.[PROJECT_REF]:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" < supabase/views/analytics.sql
```

## Verifying the Deployment

After deployment, you can test the views with these sample queries:

```sql
-- Check recent activity
SELECT * FROM recent_activity LIMIT 10;

-- See time saved leaderboard
SELECT * FROM time_saved_leaderboard;

-- View daily active users
SELECT * FROM daily_active_users 
WHERE date >= CURRENT_DATE - INTERVAL '30 days';

-- Check feature adoption rates
SELECT * FROM feature_adoption;
```

## Important Notes

- **No Data Loss**: Creating or replacing views does NOT delete any data
- **Views are Read-Only**: These views only query existing data
- **Safe to Re-run**: You can run the SQL multiple times without issues
- **Performance**: Views are computed on-demand, so complex views might take a moment to load

## Troubleshooting

If you encounter errors:

1. **"Relation does not exist"**: Make sure the `events` table exists
2. **Permission issues**: Ensure you're using the correct database credentials
3. **Syntax errors**: The SQL was written for PostgreSQL 14+

## What These Views Provide

- **daily_active_users**: Track user engagement over time
- **action_usage_summary**: See which features are most used
- **user_activity_summary**: Understand individual user behavior
- **feature_adoption**: Track feature discovery rates
- **theme_customizer_usage**: Theme customizer specific metrics
- **appstore_partner_usage**: App Store partner table metrics
- **version_adoption**: Monitor extension version uptake
- **time_saved_leaderboard**: Quantify value by feature
- **recent_activity**: Real-time activity monitoring
#!/bin/bash

# Deploy Analytics Views to Supabase
# This script creates/updates the analytics views without affecting any data

echo "🚀 Deploying Analytics Views to Supabase..."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first."
    echo "Visit: https://supabase.com/docs/guides/cli/getting-started"
    exit 1
fi

# Deploy the views using Supabase CLI
echo "📊 Creating/Updating Analytics Views..."
echo ""

# Use the Supabase CLI to execute the SQL file
supabase db push --path supabase/views/analytics.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Analytics views deployed successfully!"
    echo ""
    echo "📈 Available views:"
    echo "  - daily_active_users"
    echo "  - action_usage_summary"
    echo "  - user_activity_summary"
    echo "  - feature_adoption"
    echo "  - theme_customizer_usage"
    echo "  - appstore_partner_usage"
    echo "  - version_adoption"
    echo "  - time_saved_leaderboard"
    echo "  - recent_activity"
    echo ""
    echo "💡 You can query these views in the Supabase dashboard SQL editor"
else
    echo ""
    echo "❌ Failed to deploy views. Please check your Supabase configuration."
    echo "Run 'supabase link' if you haven't linked your project yet."
fi
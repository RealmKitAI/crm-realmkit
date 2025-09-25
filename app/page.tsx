export default function HomePage() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🚀 RealmKit CRM</h1>
      <p>Welcome to your AI-optimized CRM platform!</p>
      
      <div style={{ marginTop: '2rem' }}>
        <h2>Quick Start</h2>
        <ul>
          <li>Database is running on port 5435</li>
          <li>Redis cache is running on port 6385</li>
          <li>Access the app at http://localhost:3000</li>
        </ul>
      </div>
      
      <div style={{ marginTop: '2rem' }}>
        <h3>Next Steps:</h3>
        <ol>
          <li>Run database migrations: <code>npx prisma migrate dev</code></li>
          <li>Seed the database: <code>npx prisma db seed</code></li>
          <li>Start building your CRM features!</li>
        </ol>
      </div>
      
      <div style={{ marginTop: '3rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
        <p><strong>Login Credentials (after seeding):</strong></p>
        <ul>
          <li>Admin: admin@crm.com / password123</li>
          <li>Sales: sales@crm.com / password123</li>
        </ul>
      </div>
    </div>
  );
}
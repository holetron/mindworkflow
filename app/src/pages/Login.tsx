import React from 'react';
import LoginBackground from './auth/LoginBackground';
import LoginForm from './auth/LoginForm';

const Login: React.FC = () => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <LoginBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <LoginForm />
      </div>
    </div>
  );
};

export default Login;

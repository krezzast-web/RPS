import React from 'react';

export default function SolanaIcon({ className, size = 14, style }) {
  const width = size;
  const height = Math.round(size * (31 / 40));
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 40 31" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      <g clipPath="url(#clip0_solana_icon)">
        <path d="M6.49743 23.6602C6.73882 23.4216 7.07073 23.2823 7.42275 23.2823H39.3463C39.9297 23.2823 40.2213 23.9785 39.809 24.3863L33.5027 30.6221C33.2613 30.8608 32.9294 31 32.5774 31H0.653833C0.0704792 31 -0.221198 30.3038 0.191173 29.896L6.49743 23.6602Z" fill="currentColor"/>
        <path d="M6.49743 0.377927C6.74888 0.139236 7.08079 0 7.42275 0H39.3463C39.9297 0 40.2213 0.696182 39.809 1.10395L33.5027 7.33975C33.2613 7.57844 32.9294 7.71768 32.5774 7.71768H0.653833C0.0704792 7.71768 -0.221198 7.0215 0.191173 6.61373L6.49743 0.377927Z" fill="currentColor"/>
        <path d="M33.5027 11.9445C33.2613 11.7058 32.9294 11.5666 32.5774 11.5666H0.653833C0.0704792 11.5666 -0.221198 12.2628 0.191173 12.6705L6.49743 18.9063C6.73882 19.145 7.07073 19.2843 7.42275 19.2843H39.3463C39.9297 19.2843 40.2213 18.5881 39.809 18.1803L33.5027 11.9445Z" fill="currentColor"/>
      </g>
      <defs>
        <clipPath id="clip0_solana_icon">
          <rect width="40" height="31" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

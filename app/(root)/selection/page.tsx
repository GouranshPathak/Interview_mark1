import React from 'react';
import Link from 'next/link';
import { interviewTopics } from '@/constants';

const SelectionPage = () => {
  return (
    <div className="root-layout">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Choose Your Interview Topic</h1>
        <p className="text-lg text-neutral-600">Select a technology or role to start your AI-powered interview</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {interviewTopics.map((topic) => (
          <Link 
            key={topic.id} 
            href={`/interview?topic=${topic.id}&name=${encodeURIComponent(topic.name)}`}
            className="group"
          >
            <div className="card-interview hover:shadow-lg transition-all duration-300 cursor-pointer">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="text-4xl mb-2">{topic.icon}</div>
                <h3 className="text-xl font-semibold text-neutral-800 group-hover:text-primary-100 transition-colors">
                  {topic.name}
                </h3>
                <p className="text-sm text-neutral-600">{topic.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SelectionPage;

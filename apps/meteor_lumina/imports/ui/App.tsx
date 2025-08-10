import React from "react";
import { Hello } from "./Hello";
import { Info } from "./Info";
import { useTracker } from "meteor/react-meteor-data";
import { Meteor } from "meteor/meteor";
import { LoginForm } from "./LoginForm";

export const App = () => {
  const user = useTracker(() => Meteor.user());

  if (!user) {
    return <LoginForm />;
  }

  // Nice tailwind css landing page
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold">Welcome to Meteor!</h1>
      <Hello />
      <Info />
    </div>
  );
};

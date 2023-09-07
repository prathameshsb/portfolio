import React from "react";
import "./App.css";

import Nav from "./components/nav/Nav";
import Banner from "./components/banner/Banner";
import Experience from "./components/experience/Experience";
import Project from "./components/projects/Project";
import Education from "./components/education/Education";
import About from "./components/about/About";
import Contact from "./components/contact/Contact";
import Footer from "./components/footer/Footer";

export default function App() {
  return (
    <div className="body">
      <div className="container">
        <Nav />
        <Banner />
        <Experience />
        <Project />
        <Education />
        <About />
        <Contact />
      </div>
      <Footer />
    </div>
  );
}

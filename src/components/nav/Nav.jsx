import React, { useState } from 'react'
import cfc from "../../assests/cfc.jpeg";

import "./nav.css";

import {
  FcHome,
  FcBriefcase,
  FcTemplate,
  FcAbout,
  FcContacts,
} from "react-icons/fc";


export default function Nav() {
  const [active, setActive] = useState("#");

  const handleItemClick = (id) => {
    setActive(() => id);
  };
  return (
    <div><div className="nav">
          <div className="nav-width">
            <div className="nav-logo">
              <div className="logo-img">
                <a
                  onClick={() => handleItemClick("#")}
                  className={active === "#" ? "active" : ""}
                  href="/#"
                >
                  <img className="cfc-logo" src={cfc} alt="psbLogo" />
                </a>
              </div>
            </div>
          </div>
        </div>
        <nav>
          <a
            onClick={() => handleItemClick("#")}
            className={active === "#" ? "active" : ""}
            href="/#"
          >
            <FcHome size={30} />
            <p>Home</p>
          </a>
          <a
            onClick={() => handleItemClick("#experience")}
            className={active === "#experience" ? "active" : ""}
            href="#experience"
          >
            <FcBriefcase size={30} />
            <p>Experience</p>
          </a>
          <a
            onClick={() => handleItemClick("#projects")}
            className={active === "#projects" ? "active" : ""}
            href="#projects"
          >
            <FcTemplate size={30} />
            <p>Projects</p>
          </a>
          <a
            onClick={() => handleItemClick("#about")}
            className={active === "#about" ? "active" : ""}
            href="#about"
          >
            <FcAbout size={30} />
            <p>About</p>
          </a>
          <a
            onClick={() => handleItemClick("#contact")}
            className={active === "#contact" ? "active" : ""}
            href="#contact"
          >
            <FcContacts size={30} />
            <p>Contact</p>
          </a>
        </nav></div>
  )
}

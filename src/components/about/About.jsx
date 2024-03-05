import React from "react";
import "./about.css";
import rickshaw from "../../assests/rickshaw.svg";

function About() {
  return (
    <section id="about" className="about">
      <h1 className="word">About Me</h1>
      <div className="about-content">
        <div className="about-container">
          <div className="about-image-holder">
            <img
              src={require("../../assests/indiaGate.svg").default}
              alt="mySvgImage"
            />
            <div className="rickshaw-animation">
              <img className="rickshaw" src={rickshaw} alt="richshaw" />
            </div>
          </div>
        </div>
        <div className="about-text-content" style={{ width: "50%" }}>
          <p>
            As a dynamic professional bridging the gap between product design
            and front-end development, I excel in transforming ideas into
            actionable solutions. My process is rooted in a collaborative
            approach, engaging closely with cross-functional teams to ensure
            seamless integration of design principles with technical
            implementation. This involves deep discussions on feature usability,
            technology choices, and performance optimization, ensuring
            scalability and efficiency.
          </p>
          <p>
            Bridging product design and development, I collaborate with product
            owners, users, and back-end specialists to craft intuitive,
            user-centered designs and responsive front-ends, enhancing user
            experience with innovative solutions. My work is fueled by a
            commitment to excellence and a passion for accessible, impactful
            design.
          </p>
          <p>
            I love to watch soccer & if you know{" "}
            <span
              style={{
                backgroundColor: "#034694",
                color: "white",
                padding: "2px",
              }}
            >
              Chelsea FC
            </span>
            , yes I am a{" "}
            <span
              style={{
                textDecoration: "line-through",
              }}
            >
              delusional
            </span>{" "}
            Chelsea supporter. Also, I currently live in Milpitas, California.
          </p>

          <p>
            GO HUSKIES |{" "}
            <span className="red">
              <b>RED</b>
            </span>
            <b>BLACK</b> ONE PACK
          </p>
        </div>
      </div>
    </section>
  );
}

export default About;

window.addEventListener('load', loadStart);

const menuBtnsDiv = document.getElementsByTagName('div')[0];
function clear(){
    while (menuBtnsDiv.firstChild) {
        menuBtnsDiv.removeChild(menuBtnsDiv.firstChild);
    };
}

function loadStart(){

    let drawButton = document.createElement('button');
    drawButton.className = 'buttonClass';
    drawButton.innerText = 'Draw'
    menuBtnsDiv.appendChild(drawButton);

    let aboutButton = document.createElement('button');
    aboutButton.classList = 'buttonClass';
    aboutButton.innerText = 'About';
    menuBtnsDiv.appendChild(aboutButton)

    let visitButton = document.createElement('button');
    visitButton.classList = 'buttonClass';
    visitButton.innerText = 'Visit Website(not working)';
    visitButton.setAttribute('disabled', true)
    menuBtnsDiv.appendChild(visitButton);

    let exitButton = document.createElement('button');
    exitButton.classList = 'buttonClass';
    exitButton.innerText = 'Exit';
    menuBtnsDiv.appendChild(exitButton);

    let disclaimer = document.createElement('h1');
    disclaimer.textContent = 'DISCLAIMER: Only desktop version available!';
    menuBtnsDiv.appendChild(disclaimer);

    exitButton.addEventListener('click', () =>{
        location.href = 'https://www.google.com/';
    })

    drawButton.addEventListener('click' , loadDrawing);

    function loadDrawing(){
        clear();

        let canva = document.createElement('div');
        let canvaStyle = {
            background: 'white',
            'background-image': 'none',
            position: 'absolute',
            'margin-left': '-6px',
            border: 'solid black 3px',
            height: '700px',
            width: '1200px',
            top: '-130px',
            left: '-380px',

        };
        Object.assign(canva.style, canvaStyle );
        menuBtnsDiv.appendChild(canva);

        let divForButtons = document.createElement('div');
        divForButtons.className = 'divForBtns';
        menuBtnsDiv.appendChild(divForButtons);

        let btn1 = document.createElement('button');
        btn1.innerText = 'Backgrounds';
        let btn2 = document.createElement('button');
        btn2.innerText = 'Characters';
        let btn3 = document.createElement('button');
        btn3.innerText = 'Speech Bubbles';
        let btn4 = document.createElement('button');
        btn4.innerText = 'Subscribe';
        let btn5 = document.createElement('button');
        btn5.innerText = 'Shop';
        let btn6 = document.createElement('button');
        btn6.innerText = 'Main Menu';
        btn6.addEventListener('click', loadStart);
        let btn7 = document.createElement('button');
        btn7.innerText = 'Clear Canvas';
        btn7.addEventListener('click', clearCnavas);
        function clearCnavas(){
            while(canva.firstChild){
                canva.removeChild(canva.firstChild);
            };
        };
        let btn8 = document.createElement('button');
        btn8.innerText = 'Undo';
        btn8.addEventListener('click', undoIt);
        function undoIt(){
            canva.removeChild(canva.lastChild);
        }
        


        let dropDiv = document.createElement('div');
        dropDiv.className = 'dropDd';
        let dropDcontent = document.createElement('div');
        let btninDrop1 = document.createElement('button');
        let btninDrop2 = document.createElement('button');
        btninDrop1.innerText = 'Boy';
        btninDrop2.innerText = 'Girl';
        dropDiv.appendChild(btn1);
        dropDiv.appendChild(dropDcontent);
        btninDrop1.className = 'links';
        btninDrop2.className = 'links';


        dropDiv.className = 'dropDd';
        let dropDiv1 = document.createElement('div');
        let dropDcontent1 = document.createElement('div');
        let btninDrop3 = document.createElement('button');
        dropDcontent1.appendChild(btninDrop1);
        dropDcontent1.appendChild(btninDrop2);
        
        dropDcontent.appendChild(btninDrop3);
        dropDiv1.appendChild(btn2);
        dropDiv1.appendChild(dropDcontent1);

        btninDrop3.className = 'links';
        btninDrop3.innerText = 'Apartment';
        dropDiv1.className = 'dropDd1';
        dropDcontent.className = 'noShow';
        dropDcontent.id = 'dropItDown';
        dropDcontent1.id = 'dropItDown1';
        dropDcontent1.className = 'noShow';

        let dropDiv2 = document.createElement('div');
        dropDiv2.className = 'dropDd2';
        let dropCont2 = document.createElement('div');
        dropCont2.className = 'noShow';
        dropCont2.id = 'dropItDown2';
        dropDiv2.appendChild(btn3);
        dropDiv2.appendChild(dropCont2);
        let dropBtnBubble1 = document.createElement('button');
        let dropBtnBubble2 = document.createElement('button');
        dropCont2.appendChild(dropBtnBubble1);
        dropCont2.appendChild(dropBtnBubble2);
        dropBtnBubble1.className = 'links';
        dropBtnBubble2.className = 'links';
        dropBtnBubble1.innerText = 'Balloon 1';
        dropBtnBubble2.innerText = 'Balloon 2';

        let dropDiv3 = document.createElement('div');
        dropDiv3.className = 'dropDd3';
        dropDiv3.appendChild(btn4);
        let dropDiv4 = document.createElement('div');
        dropDiv3.className = 'dropDd4';
        dropDiv3.appendChild(btn5);
        let dropDiv5 = document.createElement('div');
        dropDiv3.className = 'dropDd5';
        dropDiv3.appendChild(btn8);
        let dropDiv6 = document.createElement('div');
        dropDiv3.className = 'dropDd6';
        dropDiv3.appendChild(btn6);
        let dropDiv7 = document.createElement('div');
        dropDiv3.className = 'dropDd7';
        dropDiv3.appendChild(btn7);
        

        divForButtons.appendChild(dropDiv);
        divForButtons.appendChild(dropDiv1);
        divForButtons.appendChild(dropDiv2);
        divForButtons.appendChild(dropDiv3);
        divForButtons.appendChild(dropDiv4);
        divForButtons.appendChild(dropDiv5);
        divForButtons.appendChild(dropDiv6);
        divForButtons.appendChild(dropDiv7);
        divForButtons.appendChild(btn6);

        btn1.className = 'btnInDrawDiv';
        btn2.className = 'btnInDrawDiv';
        btn3.className = 'btnInDrawDiv';
        btn4.className = 'btnInDrawDiv';
        btn5.className = 'btnInDrawDiv';
        btn6.className = 'btnInDrawDivMenu';
        btn7.className = 'btnInDrawDiv';
        btn8.className = 'btnInDrawDiv';

        btn1.addEventListener('click', dropFunct);
        btn2.addEventListener('click', dropFunct2);
        btn3.addEventListener('click', dropFunct3);

        function dropFunct() {
            document.getElementById("dropItDown").classList.toggle("show");
        }
        window.onclick = function(event) {
            if (!event.target.matches('.btnInDrawDivMenu')) {
              let dropdowns = document.getElementsByClassName("dropCont");
              for (let i = 0; i < dropdowns.length; i++) {
                let openDropdown = dropdowns[i];
                if (openDropdown.classList.contains('show')) {
                  openDropdown.classList.remove('show');
                };
              };
            };
          };
        function dropFunct2() {
            document.getElementById("dropItDown1").classList.toggle("show");
        }
        window.onclick = function(event) {
                if (!event.target.matches('.btnInDrawDiv')) {
                    let dropdowns = document.getElementsByClassName("dropCont1");
                    for (let i = 0; i < dropdowns.length; i++) {
                        let openDropdown = dropdowns[i];
                        if (openDropdown.classList.contains('show')) {
                            openDropdown.classList.remove('show');
                        };
                    };
                };
        };
        function dropFunct3() {
          document.getElementById("dropItDown2").classList.toggle("show");
      }
      window.onclick = function(event) {
          if (!event.target.matches('.btnInDrawDivMenu')) {
            let dropdowns = document.getElementsByClassName("dropCont2");
            for (let i = 0; i < dropdowns.length; i++) {
              let openDropdown = dropdowns[i];
              if (openDropdown.classList.contains('show')) {
                openDropdown.classList.remove('show');
              };
            };
          };
        };

        btninDrop3.addEventListener('click', addBackground);
        function addBackground(){
            clearCnavas(); 
            let url = 'background1.png';
            let img = document.createElement('img');
            img.src = url;
            img.setAttribute('width', '1200');
            img.setAttribute('height', '700');
            canva.appendChild(img);
        };

        btninDrop2.addEventListener('click', () =>{

            let img = document.createElement('img');
            img.className = 'draggable';
            img.src = 'girl2.png';
            img.setAttribute('width', '300');
            img.setAttribute('height', '500');
            canva.appendChild(img);

            const position = { x: 0, y: 0 }

            interact('.draggable').draggable({
                listeners: {
                    start (event) {
                    },
                    move (event) {
                        position.x += event.dx
                        position.y += event.dy

                        event.target.style.transform =
                            `translate(${position.x}px, ${position.y}px)`;
                    },
                }
            })
        });

        dropBtnBubble1.addEventListener('click', () =>{

            let img = document.createElement('img');
            img.className = 'draggable';
            img.src = 'bubble.png';
            img.setAttribute('width', '400');
            img.setAttribute('height', '300');
            canva.appendChild(img);

            const position = { x: 0, y: 0 }

            interact('.draggable').draggable({
                listeners: {
                    start (event) {
                    },
                    move (event) {
                        position.x += event.dx
                        position.y += event.dy

                        event.target.style.transform =
                            `translate(${position.x}px, ${position.y}px)`;
                    },
                }
            })
        });
        dropBtnBubble2.addEventListener('click', () =>{

          let img = document.createElement('img');
          img.className = 'draggable';
          img.src = 'buble2.png';
          img.setAttribute('width', '400');
          img.setAttribute('height', '300');
          canva.appendChild(img);

          const position = { x: 0, y: 0 }

          interact('.draggable').draggable({
              listeners: {
                  start (event) {
                  },
                  move (event) {
                      position.x += event.dx
                      position.y += event.dy

                      event.target.style.transform =
                          `translate(${position.x}px, ${position.y}px)`;
                  },
              }
          })
      });
        btninDrop1.addEventListener('click', () =>{

            let img = document.createElement('img');
            img.className = 'draggable';
            img.src = 'boy.png';
            img.setAttribute('width', '300');
            img.setAttribute('height', '500');
            canva.appendChild(img);

            const position = { x: 0, y: 0 }

            interact('.draggable').draggable({
                listeners: {
                    start (event) {
                    },
                    move (event) {
                        position.x += event.dx
                        position.y += event.dy

                        event.target.style.transform =
                            `translate(${position.x}px, ${position.y}px)`;
                    },
                }
            })
        });

        btn6.addEventListener('click', () =>{
            clear();
            loadStart();
        });

        
    };


    aboutButton.addEventListener('click', () => {
        clear();
        loadAbout();
    });
    
    function loadAbout(){
        clear();
        let backBtnInAbout = document.createElement('button');
        backBtnInAbout.className = 'aboutBack';
        backBtnInAbout.style.backgroundColor = 'transparent';
        backBtnInAbout.style.border = 'none';
        backBtnInAbout.style.cursor = 'pointer';
        backBtnInAbout.addEventListener('mouseover', mouseoverBackButton);
        backBtnInAbout.addEventListener('mouseout', mouseoutBackButton);
        function mouseoverBackButton(){
            img.setAttribute('width', '300');
            img.setAttribute('height', '150');
        };
        function mouseoutBackButton(){
            img.setAttribute('width', '200');
            img.setAttribute('height', '100');
        }
        
        let url = ('backarrow.png');
        let img = document.createElement('img');
        img.src = url;
        img.setAttribute('width', '200');
        img.setAttribute('height', '100');
        backBtnInAbout.appendChild(img);
        menuBtnsDiv.appendChild(backBtnInAbout);

        backBtnInAbout.addEventListener('click', () =>{
            clear();
            loadStart();
        })

        let aboutDiv = document.createElement('div');
        aboutDiv.className = 'aboutPage';
        menuBtnsDiv.appendChild(aboutDiv);

        let imgAbout = document.createElement('div');
        imgAbout.className = 'imgInAbout';
        aboutDiv.appendChild(imgAbout)
        let imgInDivAbout = document.createElement('img');
        imgInDivAbout.src = 'софтуни.png';
        imgInDivAbout.setAttribute('width', '200');
        imgInDivAbout.setAttribute('height', '300');
        imgAbout.appendChild(imgInDivAbout);


        let imgAboutParagraph = document.createElement('p');
        aboutDiv.appendChild(imgAboutParagraph);

        let imgAboutH2 = document.createElement('h2');
        imgAboutH2.textContent = 'Stefan Dimitrov';
        imgAboutH2.style.color = 'black';
        aboutDiv.appendChild(imgAboutH2);

        let buttonNext = document.createElement('button');
        buttonNext.innerText = 'Next';
        buttonNext.className = 'buttonNextAbout';
        aboutDiv.appendChild(buttonNext);

        buttonNext.addEventListener('click', () =>{
            clear();
            let backBtnInAbout = document.createElement('button');
            backBtnInAbout.className = 'aboutBack';
            backBtnInAbout.style.backgroundColor = 'transparent';
            backBtnInAbout.style.border = 'none';
            backBtnInAbout.style.cursor = 'pointer';
            backBtnInAbout.addEventListener('mouseover', mouseoverBackButton);
            backBtnInAbout.addEventListener('mouseout', mouseoutBackButton);
            function mouseoverBackButton(){
                img.setAttribute('width', '300');
                img.setAttribute('height', '150');
            };
            function mouseoutBackButton(){
                img.setAttribute('width', '200');
                img.setAttribute('height', '100');
            }
            
            let url = ('backarrow.png');
            let img = document.createElement('img');
            img.src = url;
            img.setAttribute('width', '200');
            img.setAttribute('height', '100');
            backBtnInAbout.appendChild(img);
            menuBtnsDiv.appendChild(backBtnInAbout);
    
            backBtnInAbout.addEventListener('click', () =>{
                clear();
                loadStart();
            })
            let aboutDiv = document.createElement('div');
            aboutDiv.className = 'aboutPage';
            menuBtnsDiv.appendChild(aboutDiv);
    
            let imgAbout = document.createElement('div');
            imgAbout.className = 'imgInAbout';
            aboutDiv.appendChild(imgAbout)
    
            let imgAboutParagraph = document.createElement('p');
            aboutDiv.appendChild(imgAboutParagraph);
    
            let imgAboutH2 = document.createElement('h2');
            imgAboutH2.textContent = 'Simeon Dimitrov';
            imgAboutH2.style.color = 'black';
            aboutDiv.appendChild(imgAboutH2);
             
            let buttonNext = document.createElement('button');
            buttonNext.innerText = 'Next';
            buttonNext.className = 'buttonNextAbout';
            aboutDiv.appendChild(buttonNext);

            let previousButton = document.createElement('button');
            previousButton.innerText = 'Previous';
            previousButton.className = 'buttonPreviousAbout';
            aboutDiv.appendChild(previousButton);

            previousButton.addEventListener('click', loadAbout);
        });
    };
};



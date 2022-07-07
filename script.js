window.addEventListener('load', loadStart)

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
    visitButton.innerText = 'Visit Website';
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

        
        divForButtons.appendChild(btn1);
        divForButtons.appendChild(btn2);
        divForButtons.appendChild(btn3);
        divForButtons.appendChild(btn4);
        divForButtons.appendChild(btn5);
        divForButtons.appendChild(btn6);

        btn1.className = 'btnInDrawDiv';
        btn2.className = 'btnInDrawDiv';
        btn3.className = 'btnInDrawDiv';
        btn4.className = 'btnInDrawDiv';
        btn5.className = 'btnInDrawDiv';
        btn6.className = 'btnInDrawDivMenu';


        btn6.addEventListener('click', () =>{
            clear();
            loadStart();
        });

        btn2.addEventListener('click', () =>{

            let img = document.createElement('img');
            img.src = 'animeGirl.png';
            img.setAttribute('width', '500');
            img.setAttribute('height', '300');
            img.setAttribute('draggable', true);
            canva.appendChild(img);
            img.style.position = 'absolute';
            img.style.top = '200px';
            img.style.left = '350px';
            let dragged = null;

            img.addEventListener('drag', (e) =>{
                let cursorX = e.pageX;
                let cursorY = e.pageY;
                img.style.left = cursorX/3 +'px';
                img.style.top = cursorY/3 +'px';

                img.style.border = 'solid black 5px';
            });
            img.addEventListener('dragend', () =>{
                img.setAttribute('draggable', false);
                img.style.border = '';
                
                img.setAttribute('draggable', true);
            })
            document.addEventListener("dragstart", (e) => {
                dragged = e.img;
              });
        })
    }


    aboutButton.addEventListener('click', () => {
        clear();
        loadAbout();
    });
    
    function loadAbout(){
        clear();
        let backBtnInAbout = document.createElement('button');
        backBtnInAbout.className = 'aboutBack';
        backBtnInAbout.innerText = 'Back';
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
            backBtnInAbout.innerText = 'Back';
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



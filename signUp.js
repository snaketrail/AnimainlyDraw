function signUp(){
    const menuBtnsDiv = document.getElementsByTagName('div')[0];
    function clear(){
        while (menuBtnsDiv.firstChild) {
            menuBtnsDiv.removeChild(menuBtnsDiv.firstChild);
        };
    }
    clear();

    let h1String = document.createElement('h1');
    h1String.textContent = "Sign Up";
    menuBtnsDiv.appendChild(h1String);

    let inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.placeholder = 'Username';
    menuBtnsDiv.appendChild(inputName);

    let inputEmail = document.createElement('input');
    inputEmail.type = 'email';
    inputEmail.placeholder = 'Email';
    menuBtnsDiv.appendChild(inputEmail);

    let inputPassword = document.createElement('input');
    inputPassword.type = 'password';
    inputPassword.placeholder = 'Password';
    menuBtnsDiv.appendChild(inputPassword);

    let createButton = document.createElement('button');
    createButton.id = 'createButton';
    createButton.innerText = 'Register';
    menuBtnsDiv.appendChild(createButton);


}


// Initialize Parse
Parse.initialize("TFjvb96dxA1T0qlK7vkZHybcxuG6H87bgSxkiSeq", "PhLj3pfT3yrxMDpYV1KWn5Yub0U4ueu4c7RSXuz7"); //PASTE HERE YOUR Back4App APPLICATION ID AND YOUR JavaScript KEY
Parse.serverURL = "https://parseapi.back4app.com/";

// Create a new User
async function createParseUser() {
    // Creates a new Parse "User" object, which is created by default in your Parse app
    let user = new Parse.User();
    // Set the input values to the new "User" object
    user.set("username", document.getElementById("username").value);
    user.set("email", document.getElementById("email").value);
    user.set("password", document.getElementById("password").value);
    try {
        // Call the save method, which returns the saved object if successful
        user = await user.save();
        if (user !== null) {
            // Notify the success by getting the attributes from the "User" object, by using the get method (the id attribute needs to be accessed directly, though)
            alert(
                `New object created with success! ObjectId: ${user.id
                }, ${user.get("username")}`
            );
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Add on click listener to call the create parse user function
document.getElementById("createButton").addEventListener("click", async function () {
    createParseUser();
});